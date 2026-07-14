import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getDefaultFirebaseApp } from "./firebase-default-app.js";

const auth = getAuth(getDefaultFirebaseApp());

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.replace("index.html");
    return;
  }
  document.documentElement.classList.add("video-player-authenticated");
});
