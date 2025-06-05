const firebaseConfig = {
  apiKey: "AIzaSyAuDHziWurmF5oda4CzGj_BGpdDk8KNUoI",
  authDomain: "cbmerj-sei-system.firebaseapp.com",
  projectId: "cbmerj-sei-system",
  storageBucket: "cbmerj-sei-system.firebasestorage.app",
  messagingSenderId: "292744802148",
  appId: "1:292744802148:web:379a01beb8aeb722a39471",
  measurementId: "G-SLFTK3W1TF"
};


firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();