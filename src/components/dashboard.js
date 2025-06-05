const dashboard = {
    render() {
        return `
            <div class="p-6">
                <h2 class="text-3xl font-bold mb-6">Dashboard</h2>
                
                <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div class="glass-effect rounded-xl p-6 hover:scale-105 transition-transform">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-gray-400 text-sm">Total de SEIs</p>
                                <p class="text-3xl font-bold" id="totalDocs">0</p>
                            </div>
                            <i class="fas fa-file-alt text-4xl text-blue-400 opacity-50"></i>
                        </div>
                    </div>
                    
                    <div class="glass-effect rounded-xl p-6 hover:scale-105 transition-transform">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-gray-400 text-sm">Em Andamento</p>
                                <p class="text-3xl font-bold text-blue-400" id="inProgress">0</p>
                            </div>
                            <i class="fas fa-clock text-4xl text-blue-400 opacity-50"></i>
                        </div>
                    </div>
                    
                    <div class="glass-effect rounded-xl p-6 hover:scale-105 transition-transform">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-gray-400 text-sm">Finalizados</p>
                                <p class="text-3xl font-bold text-green-400" id="completed">0</p>
                            </div>
                            <i class="fas fa-check-circle text-4xl text-green-400 opacity-50"></i>
                        </div>
                    </div>
                    
                    <div class="glass-effect rounded-xl p-6 hover:scale-105 transition-transform">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-gray-400 text-sm">Hoje</p>
                                <p class="text-3xl font-bold text-purple-400" id="today">0</p>
                            </div>
                            <i class="fas fa-calendar-day text-4xl text-purple-400 opacity-50"></i>
                        </div>
                    </div>
                </div>

                <div class="glass-effect rounded-xl p-6">
                    <h3 class="text-xl font-bold mb-4">SEIs Recentes</h3>
                    <div id="recentActivity" class="space-y-3"></div>
                </div>
            </div>
        `;
    },
    
    async load() {
        try {
            const snapshot = await db.collection('seis').orderBy('createdAt', 'desc').get();
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const today = new Date().toISOString().split('T')[0];
            
            document.getElementById('totalDocs').textContent = docs.length;
            
            const getStatus = (doc) => {
                if (doc.status === 'Finalizado') return 'Finalizado';
                const tramitations = doc.tramitations || [];
                if (tramitations.length === 0) return 'Aguardando Envio';
                const lastTramitation = tramitations[tramitations.length - 1];
                return lastTramitation.type === 'envio' ? 'Enviado' : 'Respondido';
            };
            
            const inProgressCount = docs.filter(d => {
                const status = getStatus(d);
                return status === 'Aguardando Envio' || status === 'Enviado' || status === 'Respondido';
            }).length;
            
            const completedCount = docs.filter(d => {
                const status = getStatus(d);
                return status === 'Finalizado';
            }).length;
            
            document.getElementById('inProgress').textContent = inProgressCount;
            document.getElementById('completed').textContent = completedCount;
            document.getElementById('today').textContent = docs.filter(d => d.date === today).length;
            
            const recentHTML = docs.slice(0, 5).map(doc => `
                <div class="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg hover:bg-gray-800/50 transition cursor-pointer" onclick="modal.show('${doc.id}')">
                    <div class="flex items-center space-x-3">
                        <i class="fas fa-file-alt text-blue-400"></i>
                        <div>
                            <p class="font-semibold">${doc.seiNumber}</p>
                            <p class="text-sm text-gray-400">${doc.origin} - ${doc.responsible}</p>
                            ${doc.subject ? `<p class="text-xs text-gray-500 mt-1">${doc.subject.substring(0, 50)}${doc.subject.length > 50 ? '...' : ''}</p>` : ''}
                        </div>
                    </div>
                    <span class="text-sm text-gray-400">${helpers.formatDate(doc.date)}</span>
                </div>
            `).join('');
            
            document.getElementById('recentActivity').innerHTML = recentHTML || '<p class="text-gray-400">Nenhuma atividade recente</p>';
        } catch (error) {
            console.error('Error loading dashboard:', error);
        }
    }
};