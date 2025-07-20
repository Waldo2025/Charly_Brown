import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js';


document.addEventListener("DOMContentLoaded", () => {
    const userNameSpan = document.getElementById("user-name");
    const userRoleSpan = document.getElementById("user-role");
    const messageInput = document.getElementById("message-input");
    const sendBtn = document.getElementById("send-btn");
    const messagesDiv = document.getElementById("messages");
    const usersListDiv = document.getElementById("users-list");
    const chatPanel = document.getElementById("chat-panel");

    let selectedUserId = null;

    // Configuración de Firebase
    const firebaseConfig = {
        apiKey: "AIzaSyBu4b4jV_k-UeU2E-QytrFiI6l59S9Ug-0",
        authDomain: "charly-brown.firebaseapp.com",
        projectId: "charly-brown",
        storageBucket: "charly-brown.appspot.com",
        messagingSenderId: "128488238449",
        appId: "1:128488238449:web:2b99ef5c2f0272e9871ad0",
        measurementId: "G-RL0BMDZKE6"
    };

    // ✅ Inicializar solo si no existe
    const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
    const auth = getAuth();
    const db = getFirestore(app);
    const storage = getStorage(app);

    // Solicita permiso para mostrar notificaciones
    if ("Notification" in window) {
        Notification.requestPermission().then(permission => {
        console.log("Notificaciones:", permission);
        });
    }


    async function getUserInfo() {
        const user = auth.currentUser;
        if (user) {
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
                const data = userDoc.data();
                if (userNameSpan) userNameSpan.textContent = `${data.firstName} ${data.lastName}`;
                if (userRoleSpan) userRoleSpan.textContent = data.role;
            }
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

            Object.keys(usersByRole).forEach((role, index) => {
                const section = document.createElement("div");
                section.classList.add("accordion-section");

                const header = document.createElement("div");
                header.classList.add("accordion-header", "p-2", "text-white");
                header.textContent = role;
                header.setAttribute("data-bs-toggle", "collapse");
                header.setAttribute("data-bs-target", `#collapse-${index}`);
                header.style.cursor = "pointer";
                header.style.background = "linear-gradient(to right, #3a4c8e, #7c3b85)";
                header.style.borderRadius = "6px 6px 0 0";

                const collapse = document.createElement("div");
                collapse.classList.add("accordion-collapse", "collapse");
                collapse.id = `collapse-${index}`;

                const list = document.createElement("ul");
                list.classList.add("list-unstyled", "mb-0");

                let roleContainsSelected = false;

                usersByRole[role].forEach((user) => {
                    const li = document.createElement("li");
                    li.style.width = "100%";

                    const button = document.createElement("button");
                    button.classList.add("contact-button");
                    button.style.width = "100%";

                    const isCurrentUser = auth.currentUser.uid === user.uid;
                    const displayName = `${user.firstName} ${user.lastName}` + (isCurrentUser ? " (Yo)" : "");
                    const roleTag = `<small class="text-muted ms-2">[${user.role || 'Sin rol'}]</small>`;

                    button.innerHTML = `
                        <i class="fas fa-user me-2"></i>
                        <span>${displayName} ${roleTag}</span>
                    `;

                    // Marcar como seleccionado si es el guardado
                    if (storedId === user.uid) {
                        button.classList.add("selected");
                        roleContainsSelected = true;
                        document.getElementById("chat-user-name").textContent = displayName;
                    }

                    button.addEventListener("click", () => {
                        selectedUserId = user.uid;
                        document.getElementById("chat-user-name").textContent = displayName;
                        chatPanel.style.display = 'flex';
                        loadMessages();

                        // Guardar seleccionado
                        localStorage.setItem("selectedUserId", user.uid);

                        // Limpiar anteriores y aplicar clase
                        document.querySelectorAll(".contact-button").forEach(btn => {
                            btn.classList.remove("selected");
                        });
                        button.classList.add("selected");

                        if (isMobileView()) {
                            contactsList.classList.add("mobile-hidden");
                            chatPanel.classList.remove("mobile-hidden");
                            backToContactsBtn.style.display = "inline-block";
                        }
                    });

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

        });
    }
    
    
    

    // Filtrado de contactos en tiempo real
    document.getElementById("contactSearch").addEventListener("input", function () {
        const filter = this.value.toLowerCase();
        const userButtons = document.querySelectorAll("#users-list li");

        userButtons.forEach((li) => {
            const name = li.textContent.toLowerCase();
            li.style.display = name.includes(filter) ? "block" : "none";
        });
    });


    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);
    
            if (userDoc.exists()) {
                const data = userDoc.data();
                if (userNameSpan) userNameSpan.textContent = `${data.firstName} ${data.lastName}`;
                if (userRoleSpan) userRoleSpan.textContent = data.role;
    
                // 🔒 Oculta el menú de usuarios si no es admin
                const usuariosLink = document.getElementById("gestionUsuariosLink");
                if (data.role !== "admin" && usuariosLink) {
                    usuariosLink.style.display = "none";
                }
    
                loadUsersList();
            }
        } else {
            window.location.replace("login.html");
        }
    });
    
    sendBtn.addEventListener("click", async () => {
        const message = messageInput.value.trim();
        if (message && selectedUserId) {
            const conversationId = getConversationId(auth.currentUser.uid, selectedUserId);
            await addDoc(collection(db, "messages", conversationId, "chat"), {
                senderId: auth.currentUser.uid,
                receiverId: selectedUserId,
                message: message,
                timestamp: serverTimestamp()
            });
            messageInput.value = '';
        }
    });

    function getConversationId(user1, user2) {
        return user1 < user2 ? `${user1}_${user2}` : `${user2}_${user1}`;
    }

    function loadMessages() {
        const conversationId = getConversationId(auth.currentUser.uid, selectedUserId);
        const messagesQuery = query(collection(db, "messages", conversationId, "chat"), orderBy("timestamp"));
    
        onSnapshot(messagesQuery, (snapshot) => {
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
                  // incrementa el contador en el badge
                  const badge = document.getElementById("chat-notification-badge");
                  if (badge) {
                    badge.textContent = (parseInt(badge.textContent) || 0) + 1;
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
          
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
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
    backToContactsBtn.addEventListener("click", () => {
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

    attachBtn.addEventListener("click", () => imageInput.click());

    imageInput.addEventListener("change", async (e) => {
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
                timestamp: serverTimestamp()
            });
    
        } catch (error) {
            console.error("Error al subir la imagen:", error);
        }
    });
    

    voiceBtn.addEventListener("click", async () => {
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
        const conversationId = getConversationId(auth.currentUser.uid, selectedUserId);
        const filePanel = document.querySelector(".file-list");
    
        const favQuery = query(
            collection(db, "messages", conversationId, "chat"),
            orderBy("timestamp")
        );
    
        onSnapshot(favQuery, (snapshot) => {
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
