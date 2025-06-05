const auth = {
    currentUser: null,
    
    async login(email, password) {
        try {
            const result = await firebase.auth().signInWithEmailAndPassword(email, password);
            this.currentUser = result.user;
            window.location.href = '/';
        } catch (error) {
            alert('Erro no login: ' + error.message);
        }
    },
    
    logout() {
        firebase.auth().signOut();
    },
    
    isAuthenticated() {
        return firebase.auth().currentUser !== null;
    }
};