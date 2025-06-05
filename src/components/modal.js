const modal = {
    async show(docId) {
        const doc = documents.data.find(d => d.id === docId);
        if (!doc) return;
        
        const status = documents.getDocumentStatus(doc);
        
        const modalHTML = `
            <div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onclick="modal.close(event)">
                <div class="glass-effect rounded-2xl p-6 w-full max-w-2xl animate-fade-in" onclick="event.stopPropagation()">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-2xl font-bold">Detalhes do SEI</h3>
                        <button onclick="modal.close()" class="text-gray-400 hover:text-white">
                            <i class="fas fa-times text-2xl"></i>
                        </button>
                    </div>
                    
                    <div class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <p class="text-sm text-gray-400">Nº SEI</p>
                                <p class="text-lg font-semibold">${doc.seiNumber}</p>
                            </div>
                            <div>
                                <p class="text-sm text-gray-400">Status</p>
                                <span class="px-3 py-1 rounded-full text-sm font-semibold ${helpers.getStatusColor(status)}">
                                    ${status}
                                </span>
                            </div>
                            <div>
                                <p class="text-sm text-gray-400">Data</p>
                                <p class="text-lg">${helpers.formatDate(doc.date)}</p>
                            </div>
                            <div>
                                <p class="text-sm text-gray-400">Origem</p>
                                <p class="text-lg">${doc.origin}</p>
                            </div>
                            <div>
                                <p class="text-sm text-gray-400">Responsável</p>
                                <p class="text-lg">${doc.responsible}</p>
                            </div>
                            <div>
                                <p class="text-sm text-gray-400">Cadastrado por</p>
                                <p class="text-lg">${doc.createdBy || 'Sistema'}</p>
                            </div>
                        </div>
                        
                        ${doc.subject ? `
                            <div class="mt-4 p-4 bg-gray-800/30 rounded-lg">
                                <p class="text-sm text-gray-400 mb-1">Assunto</p>
                                <p class="text-lg font-medium">${doc.subject}</p>
                            </div>
                        ` : ''}
                        
                        <div class="mt-6 pt-6 border-t border-gray-700">
                            <a href="https://sei.fazenda.rj.gov.br" target="_blank" 
                               class="inline-flex items-center px-4 py-2 bg-blue-500/20 rounded-lg hover:bg-blue-500/30 transition">
                                <i class="fas fa-external-link-alt mr-2"></i>
                                Abrir no SEI
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('modal-container').innerHTML = modalHTML;
    },
    
    close(event) {
        if (event) event.stopPropagation();
        document.getElementById('modal-container').innerHTML = '';
    }
};