const authManager = {
    currentUser: null,
    
    async login(email, password) {
        try {
            const result = await firebase.auth().signInWithEmailAndPassword(email, password);
            this.currentUser = result.user;
            window.location.href = '/app.html';
        } catch (error) {
            alert('Erro no login: ' + error.message);
        }
    },
    
    logout() {
        firebase.auth().signOut();
    },
    
    isAuthenticated() {
        return firebase.auth().currentUser !== null;
    },
    
    checkAuth() {
        firebase.auth().onAuthStateChanged((user) => {
            const loadingScreen = document.getElementById('loadingScreen');
            const mainApp = document.getElementById('mainApp');
            
            if (user) {
                this.currentUser = user;
                if (loadingScreen) loadingScreen.classList.add('hidden');
                if (mainApp) mainApp.classList.remove('hidden');
                
                if (typeof app !== 'undefined' && !app.initialized) {
                    app.init();
                }
            } else {
                window.location.href = '/login.html';
            }
        });
    }
};