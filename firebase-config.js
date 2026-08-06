firebase.initializeApp({
  projectId: "liga-das-bandas",
  appId: "1:986466099119:web:e0d345b1e22a9365a7d95a",
  storageBucket: "liga-das-bandas.firebasestorage.app",
  apiKey: "AIzaSyAILnZz9cXb-KXxNd6ot3s6BP3POu_tFyE",
  authDomain: "liga-das-bandas.firebaseapp.com",
  messagingSenderId: "986466099119",
  measurementId: "G-RBFYYJC7Q9",
});

const db = firebase.firestore();
const auth = firebase.auth();
const ADMIN_EMAIL_DOMAIN = "liga-das-bandas.app";
