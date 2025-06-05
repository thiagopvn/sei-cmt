const auth = {
    currentUser: null,
    
    async login(email, password) {
        try {
            await firebase.auth().signInWithEmailAndPassword(email, password);
            window.location.href = '/';
        } catch (error) {
            alert('Erro no login: ' + error.message);
        }
    },
    
    logout() {
        firebase.auth().signOut();
        window.location.href = '/login.html';
    },
    
    checkAuth() {
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                this.currentUser = user;
            } else {
                window.location.href = '/login.html';
            }
        });
    }
};