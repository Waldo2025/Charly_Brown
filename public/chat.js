import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js';
import { getFirestore, collection, collectionGroup, addDoc, onSnapshot, query, where, orderBy, serverTimestamp, doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js';
import { firebaseWebConfig, assertFirebaseWebConfig } from './firebase-web-config.js';
import { bootstrapFirebaseAppCheck } from './firebase-app-check.js';


document.addEventListener("DOMContentLoaded", () => {
    const userNameSpan = document.getElementById("user-name");
    const userRoleSpan = document.getElementById("user-role");
    const messageInput = document.getElementById("message-input");
    const sendBtn = document.getElementById("send-btn");
    const messagesDiv = document.getElementById("messages");
    const chatBox = document.getElementById("chat-box");
    const usersListDiv = document.getElementById("users-list");
    const chatPanel = document.getElementById("chat-panel");
    const contactsPanel = document.getElementById("contacts-panel");
    const toggleContactsPanelBtn = document.getElementById("toggleContactsPanel");
    const chatHeader = document.getElementById("chat-header");

    let selectedUserId = null;
    let unsubscribeMessages = null;
    let unsubscribeFavorites = null;
    let unsubscribeUnread = null;
    let unreadMessagesCache = [];
    let unreadByUserCache = {};

    const app = !getApps().length ? initializeApp(assertFirebaseWebConfig(firebaseWebConfig)) : getApps()[0];
    void bootstrapFirebaseAppCheck(app);
    const auth = getAuth();
    const db = getFirestore(app);
    const storage = getStorage(app);

    function ensureNotificationToggle() {
        if (!chatHeader || !("Notification" in window)) return null;
        let button = document.getElementById("enable-chat-notifications");
        if (button) return button;
        button = document.createElement("button");
        button.id = "enable-chat-notifications";
        button.type = "button";
        button.className = "btn btn-sm btn-outline-secondary";
        button.textContent = "Activar notificaciones";
        button.title = "Permitir notificaciones del chat";
        button.addEventListener("click", async () => {
            try {
                const permission = await Notification.requestPermission();
                if (permission === "granted") {
                    button.textContent = "Notificaciones activas";
                    button.disabled = true;
                } else {
                    button.textContent = "Notificaciones bloqueadas";
                }
            } catch (_) {
                button.textContent = "No disponible";
            }
        });
        chatHeader.appendChild(button);
        return button;
    }

    if ("Notification" in window) {
        const button = ensureNotificationToggle();
        if (button && Notification.permission === "granted") {
            button.textContent = "Notificaciones activas";
            button.disabled = true;
        }
    }


    function detachConversationListeners() {
        if (typeof unsubscribeMessages === "function") unsubscribeMessages();
        if (typeof unsubscribeFavorites === "function") unsubscribeFavorites();
        unsubscribeMessages = null;
        unsubscribeFavorites = null;
    }

    function getBadgeEl() {
        const chatLink = document.getElementById("chatLink");
        if (!chatLink) return null;
        let badge = document.getElementById("chat-notification-badge");
        if (!badge) {
            badge = document.createElement("em");
            badge.id = "chat-notification-badge";
            badge.className = "sidebar-badge";
            badge.hidden = true;
            badge.textContent = "0";
            chatLink.appendChild(badge);
        }
        return badge;
    }

    function upsertContactUnreadBadge(buttonEl, count) {
        if (!buttonEl) return;
        let badgeEl = buttonEl.querySelector(".contact-unread-badge");
        if (count > 0) {
            if (!badgeEl) {
                badgeEl = document.createElement("small");
                badgeEl.className = "contact-unread-badge";
                const meta = buttonEl.querySelector(".contact-meta");
                if (meta) meta.appendChild(badgeEl);
                else buttonEl.appendChild(badgeEl);
            }
            badgeEl.textContent = count > 99 ? "99+" : String(count);
            return;
        }
        if (badgeEl) badgeEl.remove();
    }

    function syncContactBadgesInList() {
        const buttons = usersListDiv?.querySelectorAll(".contact-button[data-user-id]") || [];
        buttons.forEach((btn) => {
            const uid = btn.getAttribute("data-user-id");
            const count = Number(unreadByUserCache[uid] || 0);
            upsertContactUnreadBadge(btn, count);
        });
    }

    function updateSidebarUnreadBadge(totalUnread) {
        const badge = getBadgeEl();
        if (!badge) return;
        if (totalUnread > 0) {
            badge.textContent = totalUnread > 99 ? "99+" : String(totalUnread);
            badge.hidden = false;
            badge.classList.add("is-visible");
            return;
        }
        badge.textContent = "0";
        badge.classList.remove("is-visible");
        badge.hidden = true;
    }

    function getLastReadStorageKey(conversationId) {
        return `chat_last_read:${auth.currentUser?.uid || "anon"}:${conversationId}`;
    }

    function getLastReadTs(conversationId) {
        const raw = localStorage.getItem(getLastReadStorageKey(conversationId));
        const ts = Number(raw || 0);
        return Number.isFinite(ts) ? ts : 0;
    }

    function markConversationAsRead(otherUserId) {
        if (!auth.currentUser?.uid || !otherUserId) return;
        const conversationId = getConversationId(auth.currentUser.uid, otherUserId);
        localStorage.setItem(getLastReadStorageKey(conversationId), String(Date.now()));
        recomputeUnreadBadge();
    }

    function getMessageTs(message) {
        try {
            if (message?.timestamp?.toMillis) return message.timestamp.toMillis();
            if (message?.timestamp?.seconds) return Number(message.timestamp.seconds) * 1000;
            const n = Number(message?.timestamp || 0);
            return Number.isFinite(n) ? n : 0;
        } catch (_) {
            return 0;
        }
    }

    function recomputeUnreadBadge() {
        if (!auth.currentUser?.uid) return;
        const myUid = auth.currentUser.uid;
        let total = 0;
        const map = {};
        unreadMessagesCache.forEach((msg) => {
            if (!msg || msg.senderId === myUid || msg.receiverId !== myUid) return;
            const otherUid = msg.senderId;
            if (!otherUid) return;
            const convId = getConversationId(myUid, otherUid);
            const lastRead = getLastReadTs(convId);
            const msgTs = getMessageTs(msg);
            if (msgTs > lastRead) {
                total += 1;
                map[otherUid] = (map[otherUid] || 0) + 1;
            }
        });
        unreadByUserCache = map;
        updateSidebarUnreadBadge(total);
        syncContactBadgesInList();
    }

    function startUnreadListener() {
        if (typeof unsubscribeUnread === "function") unsubscribeUnread();
        if (!auth.currentUser?.uid) return;
        const unreadQuery = query(
            collectionGroup(db, "chat"),
            where("receiverId", "==", auth.currentUser.uid)
        );
        unsubscribeUnread = onSnapshot(
            unreadQuery,
            (snapshot) => {
                unreadMessagesCache = snapshot.docs.map((d) => d.data());
                recomputeUnreadBadge();
            },
            () => {
                // Si falla collectionGroup por reglas/indices, no romper el chat.
                unreadMessagesCache = [];
                updateSidebarUnreadBadge(0);
            }
        );
    }

    function setActiveConversation(uid, displayName, buttonEl) {
        selectedUserId = uid;
        document.getElementById("chat-user-name").textContent = displayName;
        chatPanel.style.display = "flex";
        chatPanel.classList.add("is-open");
        chatPanel.classList.remove("mobile-hidden");
        localStorage.setItem("selectedUserId", uid);

        document.querySelectorAll(".contact-button").forEach(btn => {
            btn.classList.remove("selected");
        });
        if (buttonEl) buttonEl.classList.add("selected");

        try {
            loadMessages();
        } catch (_) {
            // No bloquear apertura por error secundario.
        }

        try {
            markConversationAsRead(uid);
        } catch (_) {
            // Ignorar error de contador de no leidos.
        }

        if (isMobileView()) {
            if (contactsList) contactsList.classList.add("mobile-hidden");
            chatPanel.classList.remove("mobile-hidden");
            if (backToContactsBtn) backToContactsBtn.style.display = "inline-block";
        }
    }

    function loadUsersList() {
        const usersQuery = query(collection(db, "users"));
        onSnapshot(usersQuery, (snapshot) => {
            usersListDiv.innerHTML = '';
    
            const usersByRole = {};
    
            snapshot.forEach((docSnap) => {
                const user = docSnap.data();
                const uid = docSnap.id;
                const role = user.role || "Sin rol";
    
                if (!usersByRole[role]) usersByRole[role] = [];
    
                usersByRole[role].push({ ...user, uid });
            });
    
            const storedId = localStorage.getItem("selectedUserId");
            let foundStored = false;

            Object.keys(usersByRole).forEach((role, index) => {
                const section = document.createElement("div");
                section.classList.add("accordion-section");

                const header = document.createElement("div");
                header.classList.add("accordion-header", "p-2", "text-white");
                header.textContent = role;
                header.setAttribute("data-bs-toggle", "collapse");
                header.setAttribute("data-bs-target", `#collapse-${index}`);
                header.style.cursor = "pointer";

                const collapse = document.createElement("div");
                collapse.classList.add("accordion-collapse", "collapse");
                collapse.id = `collapse-${index}`;

                const list = document.createElement("ul");
                list.classList.add("list-unstyled", "mb-0");

                let roleContainsSelected = false;

                usersByRole[role].forEach((user) => {
                    const li = document.createElement("li");

                    const button = document.createElement("button");
                    button.classList.add("contact-button");

                    const isCurrentUser = auth.currentUser.uid === user.uid;
                    const firstName = String(user.firstName || "").trim();
                    const lastName = String(user.lastName || "").trim();
                    const fullName = `${firstName} ${lastName}`.trim() || "Usuario";
                    const displayName = fullName + (isCurrentUser ? " (Yo)" : "");
                    const roleLabel = String(user.role || "Sin rol");
                    const unread = Number(unreadByUserCache[user.uid] || 0);
                    const icon = document.createElement("i");
                    icon.className = "fas fa-user me-2";

                    const meta = document.createElement("span");
                    meta.className = "contact-meta";
                    meta.append(document.createTextNode(displayName));

                    const roleTag = document.createElement("small");
                    roleTag.className = "text-muted ms-2";
                    roleTag.textContent = `[${roleLabel}]`;
                    meta.append(roleTag);

                    if (unread > 0) {
                        const badge = document.createElement("small");
                        badge.className = "contact-unread-badge";
                        badge.textContent = unread > 99 ? "99+" : String(unread);
                        meta.append(document.createTextNode(" "));
                        meta.append(badge);
                    }

                    button.append(icon, meta);
                    button.setAttribute("data-user-id", user.uid);

                    // Marcar como seleccionado si es el guardado
                    if (storedId === user.uid) {
                        button.classList.add("selected");
                        roleContainsSelected = true;
                        document.getElementById("chat-user-name").textContent = displayName;
                    }

                    button.addEventListener("click", () => {
                        setActiveConversation(user.uid, displayName, button);
                    });

                    if (storedId === user.uid) {
                        selectedUserId = user.uid;
                        foundStored = true;
                    }

                    li.appendChild(button);
                    list.appendChild(li);
                });

                collapse.appendChild(list);
                if (roleContainsSelected) {
                    collapse.classList.add("show");
                }
                
                section.appendChild(header);
                section.appendChild(collapse);
                usersListDiv.appendChild(section);
            });

            if (!foundStored && storedId) {
                localStorage.removeItem("selectedUserId");
                selectedUserId = null;
                detachConversationListeners();
                messagesDiv.innerHTML = "";
                chatPanel.classList.remove("is-open");
            } else if (foundStored) {
                const selectedBtn = usersListDiv.querySelector(".contact-button.selected");
                if (selectedBtn && selectedUserId) {
                    chatPanel.style.display = "flex";
                    chatPanel.classList.add("is-open");
                    try { loadMessages(); } catch (_) {}
                }
            }

        }, (error) => {
            console.error("No se pudo cargar la lista de contactos del chat.", error);
            usersListDiv.innerHTML = `
              <div class="chat-empty-state">
                <p>No se pudieron cargar los contactos del chat.</p>
              </div>
            `;
        });
    }
    
    
    

    // Filtrado de contactos en tiempo real
    document.getElementById("contactSearch")?.addEventListener("input", function () {
        const filter = this.value.toLowerCase();
        const userButtons = document.querySelectorAll("#users-list li");

        userButtons.forEach((li) => {
            const name = li.textContent.toLowerCase();
            li.style.display = name.includes(filter) ? "block" : "none";
        });
    });


    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const userDocRef = doc(db, "users", user.uid);
                const userDoc = await getDoc(userDocRef);

                if (userDoc.exists()) {
                    const data = userDoc.data();
                    if (userNameSpan) userNameSpan.textContent = `${data.firstName} ${data.lastName}`;
                    if (userRoleSpan) userRoleSpan.textContent = data.role || "";

                    const usuariosLink = document.getElementById("gestionUsuariosLink");
                    if ((data.role || "") !== "admin" && usuariosLink) {
                        usuariosLink.style.display = "none";
                    }
                }
            } catch (error) {
                console.error("No se pudo cargar el perfil del usuario para el chat.", error);
            }

            loadUsersList();
            startUnreadListener();
        } else {
            if (typeof unsubscribeUnread === "function") unsubscribeUnread();
            updateSidebarUnreadBadge(0);
            chatPanel.classList.remove("is-open");
            window.location.replace("login.html");
        }
    });

    if (toggleContactsPanelBtn && contactsPanel) {
        const key = "chat_contacts_panel_open";
        const stored = localStorage.getItem(key);
        const openDefault = stored === null ? false : stored === "1";
        contactsPanel.classList.toggle("is-open", openDefault);

        toggleContactsPanelBtn.addEventListener("click", () => {
            const next = !contactsPanel.classList.contains("is-open");
            contactsPanel.classList.toggle("is-open", next);
            localStorage.setItem(key, next ? "1" : "0");
        });
    } else if (contactsPanel) {
        contactsPanel.classList.add("is-open");
    }
    
    sendBtn?.addEventListener("click", async () => {
        const message = messageInput.value.trim();
        if (message && selectedUserId) {
            const conversationId = getConversationId(auth.currentUser.uid, selectedUserId);
            await addDoc(collection(db, "messages", conversationId, "chat"), {
                senderId: auth.currentUser.uid,
                receiverId: selectedUserId,
                message: message,
                favorite: false,
                timestamp: serverTimestamp()
            });
            messageInput.value = '';
        }
    });

    messageInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendBtn?.click();
        }
    });

    function getConversationId(user1, user2) {
        return user1 < user2 ? `${user1}_${user2}` : `${user2}_${user1}`;
    }

    function focusLastMessage() {
        const lastMsg = messagesDiv?.lastElementChild;
        if (!lastMsg) return;
        try {
            lastMsg.setAttribute("tabindex", "-1");
            lastMsg.scrollIntoView({ block: "end", inline: "nearest", behavior: "auto" });
            if (chatBox) {
                chatBox.scrollTop = chatBox.scrollHeight;
            } else {
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }
        } catch (_) {
            if (chatBox) {
                chatBox.scrollTop = chatBox.scrollHeight;
            } else if (messagesDiv) {
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }
        }
    }

    function loadMessages() {
        if (!selectedUserId || !auth.currentUser) return;
        detachConversationListeners();

        const conversationId = getConversationId(auth.currentUser.uid, selectedUserId);
        const messagesQuery = query(collection(db, "messages", conversationId, "chat"), orderBy("timestamp"));
    
        unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
            // 1) Notificaciones push y badge para nuevos mensajes
            snapshot.docChanges().forEach(change => {
              if (change.type === "added") {
                const msg = change.doc.data();
                // solo notificar si lo envió OTRO usuario
                if (msg.senderId !== auth.currentUser.uid) {
                  // dispara la notificación nativa
                  if (Notification.permission === "granted") {
                    new Notification("Nuevo mensaje de Chat", {
                      body: msg.message || "📷 Imagen / 🎤 Audio recibido",
                      icon: "/logo-32x32.png"    // ajusta la ruta a tu icono
                    });
                  }
                }
              }
            });
          
            // 2) Renderizado de todos los mensajes en pantalla
            messagesDiv.innerHTML = '';
            const favList = document.getElementById("favorite-list");
            favList.innerHTML = '';
          
            snapshot.forEach((docSnap) => {
              const message = docSnap.data();
              const isSent = message.senderId === auth.currentUser.uid;
              const div = document.createElement("div");
              div.classList.add(isSent ? 'sent' : 'received');
          
              // ⭐ Botón de favorito
              const favBtn = document.createElement("button");
              favBtn.classList.add("favorite-btn");
              favBtn.innerHTML = `<i class="fas fa-star"></i>`;
              if (message.favorite) favBtn.classList.add("favorited");
              favBtn.addEventListener("click", async () => {
                const newState = !message.favorite;
                await updateDoc(
                  doc(db, "messages", conversationId, "chat", docSnap.id),
                  { favorite: newState }
                );
              });
          
              // 🟣 Contenido del mensaje
              if (message.imageURL) {
                const img = document.createElement("img");
                img.src = message.imageURL;
                img.alt = "Imagen";
                img.style.maxWidth = "200px";
                img.style.borderRadius = "10px";
                div.appendChild(img);
              } else if (message.audioData) {
                const audio = document.createElement("audio");
                audio.controls = true;
                audio.src = message.audioData;
                div.appendChild(audio);
              } else if (message.message) {
                const text = document.createElement("span");
                text.textContent = message.message;
                div.appendChild(text);
              }
          
              div.appendChild(favBtn);
              messagesDiv.appendChild(div);
            });
          
            focusLastMessage();
            if (selectedUserId) markConversationAsRead(selectedUserId);
            // ✅ Cargar favoritos después de renderizar todos los mensajes
            loadFavorites();
          });
          
    }
    
    const backToContactsBtn = document.getElementById("backToContacts");
    const contactsList = document.getElementById("contacts-panel");

    function isMobileView() {
    return window.innerWidth <= 768;
    }

 

    // Al hacer clic en "← Volver"
    backToContactsBtn?.addEventListener("click", () => {
    contactsList.classList.remove("mobile-hidden");
    chatPanel.classList.add("mobile-hidden");
    });

    const attachBtn = document.getElementById("attachImageBtn");
    const imageInput = document.getElementById("imageInput");
    const voiceBtn = document.getElementById("voiceBtn");
    const voiceCanvas = document.getElementById("voiceWaveform");
    const ctx = voiceCanvas.getContext("2d");

    let mediaRecorder;
    let audioChunks = [];

    attachBtn?.addEventListener("click", () => imageInput.click());

    imageInput?.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file || !selectedUserId) return;
    
        const conversationId = getConversationId(auth.currentUser.uid, selectedUserId);
        const storageRef = ref(storage, `chat_images/${conversationId}/${Date.now()}_${file.name}`);
    
        try {
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);
    
            await addDoc(collection(db, "messages", conversationId, "chat"), {
                senderId: auth.currentUser.uid,
                receiverId: selectedUserId,
                imageURL: downloadURL,
                favorite: false,
                timestamp: serverTimestamp()
            });
    
        } catch (error) {
        }
    });
    

    voiceBtn?.addEventListener("click", async () => {
        if (!selectedUserId) return;
        if (!navigator.mediaDevices.getUserMedia) {
            alert("Tu navegador no soporta grabación de audio.");
            return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 128;
        source.connect(analyser);

        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = async () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();

            reader.onloadend = async () => {
                const base64Audio = reader.result;
                const conversationId = getConversationId(auth.currentUser.uid, selectedUserId);
                await addDoc(collection(db, "messages", conversationId, "chat"), {
                    senderId: auth.currentUser.uid,
                    receiverId: selectedUserId,
                    audioData: base64Audio,
                    favorite: false,
                    timestamp: serverTimestamp()
                });
            };
            reader.readAsDataURL(blob);
        };

        mediaRecorder.start();
        voiceCanvas.style.display = "block";

        const draw = () => {
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyser.getByteFrequencyData(dataArray);

            ctx.clearRect(0, 0, voiceCanvas.width, voiceCanvas.height);
            ctx.fillStyle = "#007bff";

            const barWidth = voiceCanvas.width / bufferLength;
            for (let i = 0; i < bufferLength; i++) {
                const barHeight = dataArray[i] / 1.5;
                ctx.fillRect(i * barWidth, voiceCanvas.height - barHeight, barWidth, barHeight);
            }

            if (mediaRecorder && mediaRecorder.state === "recording") {
                requestAnimationFrame(draw);
            } else {
                voiceCanvas.style.display = "none";
            }
        };

        draw();

        setTimeout(() => {
            mediaRecorder.stop();
            stream.getTracks().forEach(track => track.stop());
        }, 5000); // ⏱️ Limita grabación a 5 segundos
    });

    function loadFavorites() {
        if (!selectedUserId || !auth.currentUser) return;
        if (typeof unsubscribeFavorites === "function") unsubscribeFavorites();
        const conversationId = getConversationId(auth.currentUser.uid, selectedUserId);
        const filePanel = document.querySelector(".file-list");
    
        const favQuery = query(
            collection(db, "messages", conversationId, "chat"),
            orderBy("timestamp")
        );
    
        unsubscribeFavorites = onSnapshot(favQuery, (snapshot) => {
            filePanel.innerHTML = ''; // Limpia antes de renderizar
    
            let hasFavorites = false;
    
            snapshot.forEach((docSnap) => {
                const msg = docSnap.data();
                if (!msg.favorite) return;
    
                hasFavorites = true;
    
                const container = document.createElement("div");
                container.classList.add("favorite-item", "mb-2", "p-2", "border", "rounded");
    
                const starBtn = document.createElement("button");
                starBtn.innerHTML = `<i class="fas fa-star text-warning"></i>`;
                starBtn.classList.add("btn", "btn-sm", "float-end");
    
                // Permite desmarcar
                starBtn.addEventListener("click", async () => {
                    await updateDoc(doc(db, "messages", conversationId, "chat", docSnap.id), {
                        favorite: false
                    });
                });
    
                const timestamp = msg.timestamp?.toDate?.() || new Date();
                const dateText = timestamp.toLocaleString();

                // 👉 Crear etiqueta de fecha (oculta inicialmente)
                const dateLabel = document.createElement("small");
                dateLabel.classList.add("favorite-date");
                dateLabel.textContent = `Enviado el ${dateText}`;
                dateLabel.style.display = "none";
                dateLabel.style.fontSize = "11px";
                dateLabel.style.color = "#888";
                dateLabel.style.marginTop = "4px";

                // ✅ Mostrar fecha al hacer click en el contenedor (para móviles)
                container.addEventListener("click", () => {
                    dateLabel.style.display = dateLabel.style.display === "none" ? "block" : "none";
                });


                if (msg.message && !msg.audioData && msg.message.trim() !== "") {
                    const text = document.createElement("p");
                    text.textContent = msg.message;
                    container.appendChild(text);
                }
                

                if (msg.imageURL) {
                    const img = document.createElement("img");
                    img.src = msg.imageURL;
                    img.style.maxWidth = "100px";
                    img.style.borderRadius = "5px";
                    container.appendChild(img);
                }

                if (msg.audioData) {
                    const audio = document.createElement("audio");
                    audio.src = msg.audioData;
                    audio.controls = true;
                    container.appendChild(audio);
                }

                
                container.appendChild(starBtn);
                container.appendChild(dateLabel);

                filePanel.appendChild(container);
            });
    
            if (!hasFavorites) {
                filePanel.innerHTML = `<p class="text-muted">Sin archivos favoritos todavía...</p>`;
            }
        });
    }
    
    const toggleFavoritesBtn = document.getElementById("toggleFavorites");
    const filePanel = document.getElementById("file-panel");
    
    if (toggleFavoritesBtn) {
        toggleFavoritesBtn.addEventListener("click", () => {
            filePanel.classList.toggle("mobile-visible");
            chatPanel.classList.toggle("mobile-hidden");
        });
    }
    
});
