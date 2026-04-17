import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCUCS9XJ6n3D8qSQBjwt7GCANuTOvr0XEk",
  authDomain: "botd-in.firebaseapp.com",
  projectId: "botd-in",
  databaseURL: "https://botd-in-default-rtdb.firebaseio.com",
  storageBucket: "botd-in.firebasestorage.app",
  messagingSenderId: "760516612703",
  appId: "1:760516612703:web:47ce04b2be82bf31f8c1ea"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const realtimeDb = getDatabase(app);

export { app, db, auth, storage, realtimeDb };
