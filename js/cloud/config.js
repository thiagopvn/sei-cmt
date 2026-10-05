// Configuração do Firebase (projeto "projetodemop").
// Estes valores identificam o app e podem ficar no código: quem protege os dados são
// o login (Firebase Authentication) e as regras do banco (database.rules.json).

export const firebaseConfig = {
  apiKey: 'AIzaSyD8Tp-_H2Amcr6_ZWO71UhkSx296tDTjqA',
  authDomain: 'projetodemop.firebaseapp.com',
  databaseURL: 'https://projetodemop-default-rtdb.firebaseio.com',
  projectId: 'projetodemop',
  storageBucket: 'projetodemop.firebasestorage.app',
  messagingSenderId: '854527020958',
  appId: '1:854527020958:web:0529e7848447e4ffa7908f',
  measurementId: 'G-TG1J3ZSWCH',
};

/** Versão do SDK carregado do CDN oficial (gstatic). */
export const FIREBASE_SDK = '12.12.0';
export const SDK_BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK}`;

/** Onde os dados de cada usuário ficam no Realtime Database. */
export const userDataPath = (uid) => `users/${uid}/data`;
