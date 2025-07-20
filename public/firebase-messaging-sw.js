// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js');

firebase.initializeApp({
  apiKey:    '…',
  authDomain:'…',
  projectId: '…',
  messagingSenderId:'128488238449',
  appId:     '1:128488238449:web:…'
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification;
  self.registration.showNotification(title, { body });
});
