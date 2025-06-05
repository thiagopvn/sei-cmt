const customModals = {
    showAlert(message, type = 'info') {
        const icons = {
            success: 'fa-check-circle text-green-400',
            error: 'fa-times-circle text-red-400',
            warning: 'fa-exclamation-triangle text-yellow-400',
            info: 'fa-info-circle text-blue-400'
        };

        const backgrounds = {
            success: 'from-green-500/20 to-green-600/20',
            error: 'from-red-500/20 to-red-600/20',
            warning: 'from-yellow-500/20 to-yellow-600/20',
            info: 'from-blue-500/20 to-blue-600/20'
        };

        const modalHTML = `
            <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-fade-in">
                <div class="glass-effect rounded-2xl p-6 w-full max-w-md transform transition-all duration-300 scale-100 animate-modal-bounce">
                    <div class="text-center">
                        <div class="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br ${backgrounds[type]} rounded-full mb-4">
                            <i class="fas ${icons[type]} text-3xl"></i>
                        </div>
                        <p class="text-lg text-gray-100 mb-6">${message}</p>
                        <button onclick="customModals.closeAlert()" 
                                class="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-600 transition transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-400">
                            OK
                        </button>
                    </div>
                </div>
            </div>
        `;

        const container = document.createElement('div');
        container.id = 'custom-alert-modal';
        container.innerHTML = modalHTML;
        document.body.appendChild(container);

        setTimeout(() => {
            const modal = container.querySelector('.glass-effect');
            modal.classList.add('scale-100');
        }, 10);

        setTimeout(() => {
            container.querySelector('button').focus();
        }, 100);

        const handleKeyPress = (e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
                this.closeAlert();
            }
        };
        document.addEventListener('keydown', handleKeyPress);
        container._keyHandler = handleKeyPress;
    },

    closeAlert() {
        const container = document.getElementById('custom-alert-modal');
        if (container) {
            const modal = container.querySelector('.glass-effect');
            modal.classList.add('scale-95', 'opacity-0');
            
            if (container._keyHandler) {
                document.removeEventListener('keydown', container._keyHandler);
            }
            
            setTimeout(() => {
                container.remove();
            }, 200);
        }
    },

    async showPrompt(message, placeholder = '', defaultValue = '') {
        return new Promise((resolve) => {
            const modalHTML = `
                <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-fade-in">
                    <div class="glass-effect rounded-2xl p-6 w-full max-w-md transform transition-all duration-300 animate-modal-bounce">
                        <div class="mb-6">
                            <h3 class="text-xl font-bold text-gray-100 mb-2 flex items-center">
                                <i class="fas fa-edit text-blue-400 mr-3"></i>
                                ${message}
                            </h3>
                        </div>
                        
                        <input type="text" 
                               id="custom-prompt-input" 
                               placeholder="${placeholder}"
                               value="${defaultValue}"
                               class="w-full px-4 py-3 bg-gray-800/50 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition text-gray-100 placeholder-gray-500 mb-6"
                               autofocus>
                        
                        <div class="flex space-x-3 justify-end">
                            <button onclick="customModals.closePrompt(null)" 
                                    class="px-6 py-3 bg-gray-700/50 rounded-lg font-semibold hover:bg-gray-600/50 transition transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-gray-500">
                                Cancelar
                            </button>
                            <button onclick="customModals.closePrompt(document.getElementById('custom-prompt-input').value)" 
                                    id="custom-prompt-ok"
                                    class="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-600 transition transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-400">
                                <i class="fas fa-check mr-2"></i>OK
                            </button>
                        </div>
                    </div>
                </div>
            `;

            const container = document.createElement('div');
            container.id = 'custom-prompt-modal';
            container.innerHTML = modalHTML;
            document.body.appendChild(container);

            window._promptResolve = resolve;

            setTimeout(() => {
                const input = document.getElementById('custom-prompt-input');
                input.focus();
                input.select();
            }, 100);

            const handleKeyPress = (e) => {
                if (e.key === 'Enter') {
                    const value = document.getElementById('custom-prompt-input').value;
                    this.closePrompt(value);
                } else if (e.key === 'Escape') {
                    this.closePrompt(null);
                }
            };
            document.addEventListener('keydown', handleKeyPress);
            container._keyHandler = handleKeyPress;
        });
    },

    closePrompt(value) {
        const container = document.getElementById('custom-prompt-modal');
        if (container) {
            const modal = container.querySelector('.glass-effect');
            modal.classList.add('scale-95', 'opacity-0');
            
            if (container._keyHandler) {
                document.removeEventListener('keydown', container._keyHandler);
            }
            
            setTimeout(() => {
                container.remove();
                if (window._promptResolve) {
                    window._promptResolve(value);
                    delete window._promptResolve;
                }
            }, 200);
        }
    },

    async showConfirm(message, confirmText = 'Confirmar', cancelText = 'Cancelar', isDanger = false) {
        return new Promise((resolve) => {
            const modalHTML = `
                <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-fade-in">
                    <div class="glass-effect rounded-2xl p-6 w-full max-w-md transform transition-all duration-300 animate-modal-bounce">
                        <div class="text-center mb-6">
                            <div class="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br ${isDanger ? 'from-red-500/20 to-red-600/20' : 'from-blue-500/20 to-blue-600/20'} rounded-full mb-4">
                                <i class="fas ${isDanger ? 'fa-exclamation-triangle text-red-400' : 'fa-question-circle text-blue-400'} text-3xl"></i>
                            </div>
                            <p class="text-lg text-gray-100">${message}</p>
                        </div>
                        
                        <div class="flex space-x-3 justify-center">
                            <button onclick="customModals.closeConfirm(false)" 
                                    class="px-6 py-3 bg-gray-700/50 rounded-lg font-semibold hover:bg-gray-600/50 transition transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-gray-500">
                                ${cancelText}
                            </button>
                            <button onclick="customModals.closeConfirm(true)" 
                                    class="px-6 py-3 ${isDanger ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700' : 'bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600'} rounded-lg font-semibold transition transform hover:scale-105 focus:outline-none focus:ring-2 ${isDanger ? 'focus:ring-red-400' : 'focus:ring-blue-400'}">
                                <i class="fas fa-check mr-2"></i>${confirmText}
                            </button>
                        </div>
                    </div>
                </div>
            `;

            const container = document.createElement('div');
            container.id = 'custom-confirm-modal';
            container.innerHTML = modalHTML;
            document.body.appendChild(container);

            window._confirmResolve = resolve;

            const handleKeyPress = (e) => {
                if (e.key === 'Escape') {
                    this.closeConfirm(false);
                }
            };
            document.addEventListener('keydown', handleKeyPress);
            container._keyHandler = handleKeyPress;
        });
    },

    closeConfirm(value) {
        const container = document.getElementById('custom-confirm-modal');
        if (container) {
            const modal = container.querySelector('.glass-effect');
            modal.classList.add('scale-95', 'opacity-0');
            
            if (container._keyHandler) {
                document.removeEventListener('keydown', container._keyHandler);
            }
            
            setTimeout(() => {
                container.remove();
                if (window._confirmResolve) {
                    window._confirmResolve(value);
                    delete window._confirmResolve;
                }
            }, 200);
        }
    }
};

const style = document.createElement('style');
style.textContent = `
    @keyframes modal-bounce {
        0% { transform: scale(0.9); opacity: 0; }
        50% { transform: scale(1.02); }
        100% { transform: scale(1); opacity: 1; }
    }
    
    .animate-modal-bounce {
        animation: modal-bounce 0.3s ease-out;
    }
`;
document.head.appendChild(style);

window.customModals = customModals;