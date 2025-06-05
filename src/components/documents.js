const documents = {
    data: [],
    origins: ['CHGAB', 'CBA-I', 'OUVI', 'GOCG', 'DGST', 'ARQDGP'],
    responsibles: ['CB Paulo', 'TC Bonelá'],
    sections: ['SAD', 'SOP', 'AIOP', 'SST', 'SSMT'],
    
    render() {
        return `
            <div class="p-6">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-3xl font-bold">Documentos SEI</h2>
                    <div class="flex space-x-4">
                        <input type="text" id="searchInput" placeholder="Buscar SEI, responsável ou assunto..."
                               class="px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg w-64 focus:outline-none focus:border-blue-400"
                               onkeyup="documents.filter()">
                        <select id="statusFilter" onchange="documents.filter()"
                                class="px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-400">
                            <option value="">Todos</option>
                            <option value="Aguardando Envio">Aguardando Envio</option>
                            <option value="Enviado">Enviado</option>
                            <option value="Respondido">Respondido</option>
                            <option value="Finalizado">Finalizado</option>
                        </select>
                    </div>
                </div>

                <div class="glass-effect rounded-xl overflow-hidden">
                    <table class="w-full">
                        <thead class="bg-gray-800/50">
                            <tr>
                                <th class="px-6 py-3 text-left">Nº SEI</th>
                                <th class="px-6 py-3 text-left">Data</th>
                                <th class="px-6 py-3 text-left">Assunto</th>
                                <th class="px-6 py-3 text-left">Origem</th>
                                <th class="px-6 py-3 text-left">Responsável</th>
                                <th class="px-6 py-3 text-left">Seção</th>
                                <th class="px-6 py-3 text-left">Status</th>
                                <th class="px-6 py-3 text-left">Tramitações</th>
                                <th class="px-6 py-3 text-left">Ações</th>
                            </tr>
                        </thead>
                        <tbody id="documentsTable" class="divide-y divide-gray-700"></tbody>
                    </table>
                </div>
            </div>
        `;
    },
    
    renderForm() {
        this.loadOrigins();
        this.loadResponsibles();
        this.loadSections();
        return `
            <div class="p-6">
                <h2 class="text-3xl font-bold mb-6">Novo SEI</h2>
                
                <form id="documentForm" onsubmit="documents.save(event)" class="glass-effect rounded-xl p-6 space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label class="block text-sm font-medium mb-2">Nº SEI</label>
                            <input type="text" id="seiNumber" required placeholder="SEI-270001/001744/2025"
                                   class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-400">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium mb-2">Data</label>
                            <input type="date" id="date" required
                                   class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-400">
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium mb-2">Origem</label>
                            <div class="flex space-x-2">
                                <select id="origin" required
                                        class="flex-1 px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-400">
                                    <option value="">Selecione...</option>
                                    ${this.origins.map(origin => `<option value="${origin}">${origin}</option>`).join('')}
                                    <option value="_new_">+ Nova origem...</option>
                                </select>
                                <button type="button" onclick="documents.manageOrigins()" 
                                        class="px-4 py-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition"
                                        title="Gerenciar origens">
                                    <i class="fas fa-cog"></i>
                                </button>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium mb-2">Responsável</label>
                            <div class="flex space-x-2">
                                <select id="responsible" required
                                        class="flex-1 px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-400">
                                    <option value="">Selecione...</option>
                                    ${this.responsibles.map(resp => `<option value="${resp}">${resp}</option>`).join('')}
                                    <option value="_new_">+ Novo responsável...</option>
                                </select>
                                <button type="button" onclick="documents.manageResponsibles()" 
                                        class="px-4 py-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition"
                                        title="Gerenciar responsáveis">
                                    <i class="fas fa-cog"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-2">Assunto</label>
                        <input type="text" id="subject" required placeholder="Digite o assunto do documento"
                               class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-400">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium mb-2">Seção Responsável</label>
                        <div class="flex space-x-2">
                            <select id="section" required
                                    class="flex-1 px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-400">
                                <option value="">Selecione...</option>
                                ${this.sections.map(section => `<option value="${section}">${section}</option>`).join('')}
                                <option value="_new_">+ Nova seção...</option>
                            </select>
                            <button type="button" onclick="documents.manageSections()" 
                                    class="px-4 py-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition"
                                    title="Gerenciar seções">
                                <i class="fas fa-cog"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="border-t border-gray-700 pt-6">
                        <h3 class="text-lg font-semibold mb-4">Primeira Tramitação (Opcional)</h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium mb-2">Enviar para</label>
                                <select id="firstDestination"
                                        class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-400">
                                    <option value="">Não enviar agora</option>
                                    ${this.origins.map(origin => `<option value="${origin}">${origin}</option>`).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-2">Data do Envio</label>
                                <input type="date" id="firstTramitationDate"
                                       class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-400">
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-2">Nº do Documento de Envio</label>
                                <input type="text" id="firstDocumentNumber" placeholder="Ex: OFÍCIO 123/2025"
                                       class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-400">
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex space-x-4">
                        <button type="submit" 
                                class="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-600 transition transform hover:scale-105">
                            <i class="fas fa-save mr-2"></i>Salvar
                        </button>
                        <button type="button" onclick="seiApp.showDocuments()"
                                class="px-6 py-3 bg-gray-700 rounded-lg font-semibold hover:bg-gray-600 transition">
                            Cancelar
                        </button>
                    </div>
                </form>
            </div>
        `;
    },
    
    async loadOrigins() {
        try {
            const snapshot = await db.collection('origins').orderBy('name').get();
            const customOrigins = snapshot.docs.map(doc => doc.data().name);
            this.origins = ['CHGAB', 'CBA-I', 'OUVI', 'GOCG', 'DGST', 'ARQDGP', ...customOrigins];
            
            const originSelect = document.getElementById('origin');
            if (originSelect) {
                originSelect.addEventListener('change', (e) => {
                    if (e.target.value === '_new_') {
                        this.addNewOrigin();
                    }
                });
            }
        } catch (error) {
            console.error('Error loading origins:', error);
        }
    },
    
    async loadResponsibles() {
        try {
            const snapshot = await db.collection('responsibles').orderBy('name').get();
            const customResponsibles = snapshot.docs.map(doc => doc.data().name);
            this.responsibles = ['CB Paulo', 'TC Bonelá', ...customResponsibles];
            
            const responsibleSelect = document.getElementById('responsible');
            if (responsibleSelect) {
                responsibleSelect.addEventListener('change', (e) => {
                    if (e.target.value === '_new_') {
                        this.addNewResponsible();
                    }
                });
            }
        } catch (error) {
            console.error('Error loading responsibles:', error);
        }
    },
    
    async loadSections() {
        try {
            const snapshot = await db.collection('sections').orderBy('name').get();
            const customSections = snapshot.docs.map(doc => doc.data().name);
            this.sections = ['SAD', 'SOP', 'AIOP', 'SST', 'SSMT', ...customSections];
            
            const sectionSelect = document.getElementById('section');
            if (sectionSelect) {
                sectionSelect.addEventListener('change', (e) => {
                    if (e.target.value === '_new_') {
                        this.addNewSection();
                    }
                });
            }
        } catch (error) {
            console.error('Error loading sections:', error);
        }
    },
    
    async addNewOrigin() {
        const newOrigin = await customModals.showPrompt('Digite a nova sigla de origem:', 'Ex: DGAB, SECT, etc.');
        if (newOrigin && newOrigin.trim()) {
            const origin = newOrigin.trim().toUpperCase();
            
            if (this.origins.includes(origin)) {
                customModals.showAlert('Esta origem já existe!', 'warning');
                return;
            }
            
            try {
                await db.collection('origins').add({
                    name: origin,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdBy: authManager.currentUser.email
                });
                
                this.origins.push(origin);
                this.origins.sort();
                
                const originSelect = document.getElementById('origin');
                originSelect.innerHTML = `
                    <option value="">Selecione...</option>
                    ${this.origins.map(o => `<option value="${o}">${o}</option>`).join('')}
                    <option value="_new_">+ Nova origem...</option>
                `;
                originSelect.value = origin;
                
                customModals.showAlert('Origem adicionada com sucesso!', 'success');
            } catch (error) {
                customModals.showAlert('Erro ao adicionar origem: ' + error.message, 'error');
            }
        }
    },
    
    async addNewResponsible() {
        const newResponsible = await customModals.showPrompt('Digite o nome do novo responsável:', 'Ex: TC Silva, CB Santos, etc.');
        if (newResponsible && newResponsible.trim()) {
            const responsible = newResponsible.trim();
            
            if (this.responsibles.includes(responsible)) {
                customModals.showAlert('Este responsável já existe!', 'warning');
                return;
            }
            
            try {
                await db.collection('responsibles').add({
                    name: responsible,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdBy: authManager.currentUser.email
                });
                
                this.responsibles.push(responsible);
                this.responsibles.sort();
                
                const responsibleSelect = document.getElementById('responsible');
                responsibleSelect.innerHTML = `
                    <option value="">Selecione...</option>
                    ${this.responsibles.map(r => `<option value="${r}">${r}</option>`).join('')}
                    <option value="_new_">+ Novo responsável...</option>
                `;
                responsibleSelect.value = responsible;
                
                customModals.showAlert('Responsável adicionado com sucesso!', 'success');
            } catch (error) {
                customModals.showAlert('Erro ao adicionar responsável: ' + error.message, 'error');
            }
        }
    },
    
    async addNewSection() {
        const newSection = await customModals.showPrompt('Digite a nova sigla da seção:', 'Ex: DAG, DGAF, etc.');
        if (newSection && newSection.trim()) {
            const section = newSection.trim().toUpperCase();
            
            if (this.sections.includes(section)) {
                customModals.showAlert('Esta seção já existe!', 'warning');
                return;
            }
            
            try {
                await db.collection('sections').add({
                    name: section,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdBy: authManager.currentUser.email
                });
                
                this.sections.push(section);
                this.sections.sort();
                
                const sectionSelect = document.getElementById('section');
                sectionSelect.innerHTML = `
                    <option value="">Selecione...</option>
                    ${this.sections.map(s => `<option value="${s}">${s}</option>`).join('')}
                    <option value="_new_">+ Nova seção...</option>
                `;
                sectionSelect.value = section;
                
                customModals.showAlert('Seção adicionada com sucesso!', 'success');
            } catch (error) {
                customModals.showAlert('Erro ao adicionar seção: ' + error.message, 'error');
            }
        }
    },
    
    manageOrigins() {
        const modalHTML = `
            <div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onclick="modal.close(event)">
                <div class="glass-effect rounded-2xl p-6 w-full max-w-md animate-fade-in" onclick="event.stopPropagation()">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-xl font-bold">Gerenciar Origens</h3>
                        <button onclick="modal.close()" class="text-gray-400 hover:text-white">
                            <i class="fas fa-times text-2xl"></i>
                        </button>
                    </div>
                    
                    <div class="space-y-2 max-h-96 overflow-y-auto">
                        ${this.origins.map(origin => {
                            const isDefault = ['CHGAB', 'CBA-I', 'OUVI', 'GOCG', 'DGST', 'ARQDGP'].includes(origin);
                            return `
                                <div class="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
                                    <span class="${isDefault ? 'text-gray-400' : ''}">${origin}</span>
                                    ${!isDefault ? `
                                        <button onclick="documents.removeOrigin('${origin}')" 
                                                class="text-red-400 hover:text-red-300">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    ` : '<span class="text-xs text-gray-500">Padrão</span>'}
                                </div>
                            `;
                        }).join('')}
                    </div>
                    
                    <div class="mt-4">
                        <button onclick="documents.addNewOriginFromModal()" 
                                class="w-full px-4 py-2 bg-blue-500/20 rounded-lg hover:bg-blue-500/30 transition">
                            <i class="fas fa-plus mr-2"></i>Adicionar Nova Origem
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('modal-container').innerHTML = modalHTML;
    },
    
    manageResponsibles() {
        const modalHTML = `
            <div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onclick="modal.close(event)">
                <div class="glass-effect rounded-2xl p-6 w-full max-w-md animate-fade-in" onclick="event.stopPropagation()">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-xl font-bold">Gerenciar Responsáveis</h3>
                        <button onclick="modal.close()" class="text-gray-400 hover:text-white">
                            <i class="fas fa-times text-2xl"></i>
                        </button>
                    </div>
                    
                    <div class="space-y-2 max-h-96 overflow-y-auto">
                        ${this.responsibles.map(responsible => {
                            const isDefault = ['CB Paulo', 'TC Bonelá'].includes(responsible);
                            return `
                                <div class="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
                                    <span class="${isDefault ? 'text-gray-400' : ''}">${responsible}</span>
                                    ${!isDefault ? `
                                        <button onclick="documents.removeResponsible('${responsible}')" 
                                                class="text-red-400 hover:text-red-300">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    ` : '<span class="text-xs text-gray-500">Padrão</span>'}
                                </div>
                            `;
                        }).join('')}
                    </div>
                    
                    <div class="mt-4">
                        <button onclick="documents.addNewResponsibleFromModal()" 
                                class="w-full px-4 py-2 bg-blue-500/20 rounded-lg hover:bg-blue-500/30 transition">
                            <i class="fas fa-plus mr-2"></i>Adicionar Novo Responsável
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('modal-container').innerHTML = modalHTML;
    },
    
    manageSections() {
        const modalHTML = `
            <div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onclick="modal.close(event)">
                <div class="glass-effect rounded-2xl p-6 w-full max-w-md animate-fade-in" onclick="event.stopPropagation()">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-xl font-bold">Gerenciar Seções</h3>
                        <button onclick="modal.close()" class="text-gray-400 hover:text-white">
                            <i class="fas fa-times text-2xl"></i>
                        </button>
                    </div>
                    
                    <div class="space-y-2 max-h-96 overflow-y-auto">
                        ${this.sections.map(section => {
                            const isDefault = ['SAD', 'SOP', 'AIOP', 'SST', 'SSMT'].includes(section);
                            return `
                                <div class="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
                                    <span class="${isDefault ? 'text-gray-400' : ''}">${section}</span>
                                    ${!isDefault ? `
                                        <button onclick="documents.removeSection('${section}')" 
                                                class="text-red-400 hover:text-red-300">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    ` : '<span class="text-xs text-gray-500">Padrão</span>'}
                                </div>
                            `;
                        }).join('')}
                    </div>
                    
                    <div class="mt-4">
                        <button onclick="documents.addNewSectionFromModal()" 
                                class="w-full px-4 py-2 bg-blue-500/20 rounded-lg hover:bg-blue-500/30 transition">
                            <i class="fas fa-plus mr-2"></i>Adicionar Nova Seção
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('modal-container').innerHTML = modalHTML;
    },
    
    showTramitations(docId) {
        const doc = this.data.find(d => d.id === docId);
        if (!doc) return;
        
        const tramitations = doc.tramitations || [];
        const currentStatus = this.getDocumentStatus(doc);
        
        const modalHTML = `
            <div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onclick="modal.close(event)">
                <div class="glass-effect rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-fade-in" onclick="event.stopPropagation()">
                    <div class="flex justify-between items-center mb-6">
                        <div>
                            <h3 class="text-2xl font-bold">Tramitações - ${doc.seiNumber}</h3>
                            ${doc.subject ? `<p class="text-sm text-gray-300 mt-1">Assunto: ${doc.subject}</p>` : ''}
                            ${doc.section ? `<p class="text-sm text-gray-300">Seção Responsável: ${doc.section}</p>` : ''}
                            <p class="text-sm text-gray-400 mt-1">Status atual: <span class="${helpers.getStatusColor(currentStatus)}">${currentStatus}</span></p>
                            <p class="text-sm text-gray-400">Total de tramitações: ${tramitations.length}</p>
                        </div>
                        <button onclick="modal.close()" class="text-gray-400 hover:text-white">
                            <i class="fas fa-times text-2xl"></i>
                        </button>
                    </div>
                    
                    <div class="space-y-4 mb-6">
                        ${tramitations.length > 0 ? tramitations.map((tram, index) => `
                            <div class="flex items-start space-x-4 p-4 bg-gray-800/30 rounded-lg">
                                <div class="flex-shrink-0 w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
                                    <span class="text-blue-400 font-bold">${index + 1}</span>
                                </div>
                                <div class="flex-1">
                                    <div class="flex items-center justify-between">
                                        <p class="font-semibold">
                                            ${tram.type === 'envio' ? 
                                                `<i class="fas fa-paper-plane text-blue-400 mr-2"></i>Enviado para ${tram.destination}` : 
                                                `<i class="fas fa-reply text-green-400 mr-2"></i>Retornou de ${tram.destination}`
                                            }
                                        </p>
                                        <span class="text-sm text-gray-400">${helpers.formatDate(tram.date)}</span>
                                    </div>
                                    ${tram.documentNumber ? `
                                        <p class="text-sm text-blue-300 mt-1">
                                            <i class="fas fa-file-alt mr-1"></i>Documento: ${tram.documentNumber}
                                        </p>
                                    ` : ''}
                                    ${tram.observation ? `<p class="text-sm text-gray-300 mt-1">${tram.observation}</p>` : ''}
                                    <p class="text-xs text-gray-500 mt-1">Registrado por: ${tram.registeredBy}</p>
                                </div>
                            </div>
                        `).join('') : '<p class="text-gray-400 text-center py-8">Nenhuma tramitação registrada</p>'}
                    </div>
                    
                    <div class="border-t border-gray-700 pt-6">
                        <h4 class="text-lg font-semibold mb-4">Nova Tramitação (Tramitação ${tramitations.length + 1})</h4>
                        <form onsubmit="documents.addTramitation(event, '${docId}')" class="space-y-4">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium mb-2">Tipo</label>
                                    <select id="tramitationType" required onchange="documents.updateTramitationForm()"
                                            class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-400">
                                        ${currentStatus === 'Aguardando Envio' || currentStatus === 'Respondido' ? 
                                            '<option value="envio">Enviar</option>' : ''
                                        }
                                        ${currentStatus === 'Enviado' ? 
                                            '<option value="retorno">Retornou</option>' : ''
                                        }
                                        ${currentStatus === 'Finalizado' ? 
                                            '<option value="">Documento finalizado</option>' : ''
                                        }
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium mb-2">
                                        <span id="destinationLabel">${currentStatus === 'Enviado' ? 'Retornou de' : 'Enviar para'}</span>
                                    </label>
                                    <select id="tramitationDestination" required
                                            class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-400">
                                        <option value="">Selecione...</option>
                                        ${this.origins.map(origin => `<option value="${origin}">${origin}</option>`).join('')}
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium mb-2">Data</label>
                                    <input type="date" id="tramitationDate" required value="${new Date().toISOString().split('T')[0]}"
                                           class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-400">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium mb-2">Nº do Documento</label>
                                    <input type="text" id="documentNumber" placeholder="Ex: OFÍCIO 123/2025, MEMORANDO 456"
                                           class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-400">
                                </div>
                                <div class="md:col-span-2">
                                    <label class="block text-sm font-medium mb-2">Observação (opcional)</label>
                                    <input type="text" id="tramitationObservation" placeholder="Ex: Respondido com parecer favorável"
                                           class="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-400">
                                </div>
                            </div>
                            <div class="flex space-x-4">
                                <button type="submit" ${currentStatus === 'Finalizado' ? 'disabled' : ''}
                                        class="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-600 transition transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed">
                                    <i class="fas fa-plus mr-2"></i>Adicionar Tramitação ${tramitations.length + 1}
                                </button>
                                ${currentStatus !== 'Finalizado' ? `
                                    <button type="button" onclick="documents.finalizeSEI('${docId}')"
                                            class="px-6 py-3 bg-green-600 rounded-lg font-semibold hover:bg-green-700 transition">
                                        <i class="fas fa-check-circle mr-2"></i>Finalizar SEI
                                    </button>
                                ` : ''}
                            </div>
                        </form>
                    </div>
                    
                    <div class="mt-6 p-4 bg-gray-800/30 rounded-lg">
                        <p class="text-sm text-gray-400">
                            <i class="fas fa-info-circle mr-2"></i>
                            <strong>Como funciona:</strong> Cada tramitação representa um movimento do documento. 
                            Tramitação 1 é o primeiro envio, Tramitação 2 quando retorna e é enviado novamente, e assim por diante.
                        </p>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('modal-container').innerHTML = modalHTML;
    },
    
    updateTramitationForm() {
        const type = document.getElementById('tramitationType').value;
        const label = document.getElementById('destinationLabel');
        if (label) {
            label.textContent = type === 'retorno' ? 'Retornou de' : 'Enviar para';
        }
    },
    
    async addTramitation(event, docId) {
        event.preventDefault();
        
        const type = document.getElementById('tramitationType').value;
        const destination = document.getElementById('tramitationDestination').value;
        const date = document.getElementById('tramitationDate').value;
        const documentNumber = document.getElementById('documentNumber').value;
        const observation = document.getElementById('tramitationObservation').value;
        
        if (!type) {
            customModals.showAlert('Este documento já está finalizado!', 'warning');
            return;
        }
        
        const tramitation = {
            type,
            destination,
            date,
            documentNumber,
            observation,
            registeredBy: authManager.currentUser.email,
            registeredAt: new Date().toISOString()
        };
        
        try {
            await db.collection('seis').doc(docId).update({
                tramitations: firebase.firestore.FieldValue.arrayUnion(tramitation),
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            customModals.showAlert('Tramitação registrada com sucesso!', 'success');
            await this.load();
            this.showTramitations(docId);
        } catch (error) {
            customModals.showAlert('Erro ao registrar tramitação: ' + error.message, 'error');
        }
    },
    
    async finalizeSEI(docId) {
        const confirmed = await customModals.showConfirm(
            'Tem certeza que deseja finalizar este SEI? Esta ação não pode ser desfeita.',
            'Finalizar SEI',
            'Cancelar',
            false
        );
        
        if (confirmed) {
            try {
                await db.collection('seis').doc(docId).update({
                    status: 'Finalizado',
                    finalizedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    finalizedBy: authManager.currentUser.email
                });
                
                customModals.showAlert('SEI finalizado com sucesso!', 'success');
                await this.load();
                modal.close();
            } catch (error) {
                customModals.showAlert('Erro ao finalizar SEI: ' + error.message, 'error');
            }
        }
    },
    
    getDocumentStatus(doc) {
        if (doc.status === 'Finalizado') return 'Finalizado';
        
        const tramitations = doc.tramitations || [];
        if (tramitations.length === 0) return 'Aguardando Envio';
        
        const lastTramitation = tramitations[tramitations.length - 1];
        return lastTramitation.type === 'envio' ? 'Enviado' : 'Respondido';
    },
    
    async removeOrigin(origin) {
        const confirmed = await customModals.showConfirm(
            `Remover a origem "${origin}"?`,
            'Remover',
            'Cancelar',
            true
        );
        
        if (confirmed) {
            try {
                const snapshot = await db.collection('origins').where('name', '==', origin).get();
                snapshot.forEach(doc => doc.ref.delete());
                
                this.origins = this.origins.filter(o => o !== origin);
                this.manageOrigins();
            } catch (error) {
                customModals.showAlert('Erro ao remover origem: ' + error.message, 'error');
            }
        }
    },
    
    async removeResponsible(responsible) {
        const confirmed = await customModals.showConfirm(
            `Remover o responsável "${responsible}"?`,
            'Remover',
            'Cancelar',
            true
        );
        
        if (confirmed) {
            try {
                const snapshot = await db.collection('responsibles').where('name', '==', responsible).get();
                snapshot.forEach(doc => doc.ref.delete());
                
                this.responsibles = this.responsibles.filter(r => r !== responsible);
                this.manageResponsibles();
            } catch (error) {
                customModals.showAlert('Erro ao remover responsável: ' + error.message, 'error');
            }
        }
    },
    
    async removeSection(section) {
        const confirmed = await customModals.showConfirm(
            `Remover a seção "${section}"?`,
            'Remover',
            'Cancelar',
            true
        );
        
        if (confirmed) {
            try {
                const snapshot = await db.collection('sections').where('name', '==', section).get();
                snapshot.forEach(doc => doc.ref.delete());
                
                this.sections = this.sections.filter(s => s !== section);
                this.manageSections();
            } catch (error) {
                customModals.showAlert('Erro ao remover seção: ' + error.message, 'error');
            }
        }
    },
    
    async addNewOriginFromModal() {
        modal.close();
        await this.addNewOrigin();
        this.manageOrigins();
    },
    
    async addNewResponsibleFromModal() {
        modal.close();
        await this.addNewResponsible();
        this.manageResponsibles();
    },
    
    async addNewSectionFromModal() {
        modal.close();
        await this.addNewSection();
        this.manageSections();
    },
    
    async load() {
        try {
            const snapshot = await db.collection('seis').orderBy('createdAt', 'desc').get();
            this.data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.renderTable(this.data);
        } catch (error) {
            console.error('Error loading documents:', error);
        }
    },
    
    renderTable(docs) {
        const tableHTML = docs.map(doc => {
            const status = this.getDocumentStatus(doc);
            const tramitationsCount = (doc.tramitations || []).length;
            const truncatedSubject = doc.subject ? (doc.subject.length > 30 ? doc.subject.substring(0, 30) + '...' : doc.subject) : '';
            
            return `
                <tr class="hover:bg-gray-800/30 transition">
                    <td class="px-6 py-4 cursor-pointer text-blue-400 hover:text-blue-300" onclick="modal.show('${doc.id}')">${doc.seiNumber}</td>
                    <td class="px-6 py-4">${helpers.formatDate(doc.date)}</td>
                    <td class="px-6 py-4" title="${doc.subject || ''}">${truncatedSubject || '<span class="text-gray-500">-</span>'}</td>
                    <td class="px-6 py-4">${doc.origin}</td>
                    <td class="px-6 py-4">${doc.responsible}</td>
                    <td class="px-6 py-4">${doc.section || '<span class="text-gray-500">-</span>'}</td>
                    <td class="px-6 py-4">
                        <span class="px-3 py-1 rounded-full text-xs font-semibold ${helpers.getStatusColor(status)}">
                            ${status}
                        </span>
                    </td>
                    <td class="px-6 py-4">
                        <button onclick="documents.showTramitations('${doc.id}')" 
                                class="px-3 py-1 bg-blue-500/20 rounded-lg hover:bg-blue-500/30 transition">
                            <i class="fas fa-route mr-2"></i>${tramitationsCount}
                        </button>
                    </td>
                    <td class="px-6 py-4">
                        <button onclick="documents.delete('${doc.id}')" class="text-red-400 hover:text-red-300">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        
        document.getElementById('documentsTable').innerHTML = tableHTML || '<tr><td colspan="9" class="text-center py-8 text-gray-400">Nenhum documento encontrado</td></tr>';
    },
    
    filter() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const statusFilter = document.getElementById('statusFilter').value;
        
        const filtered = this.data.filter(doc => {
            const status = this.getDocumentStatus(doc);
            const matchesSearch = !searchTerm || 
                doc.seiNumber.toLowerCase().includes(searchTerm) ||
                doc.responsible.toLowerCase().includes(searchTerm) ||
                (doc.subject && doc.subject.toLowerCase().includes(searchTerm)) ||
                (doc.section && doc.section.toLowerCase().includes(searchTerm));
            const matchesStatus = !statusFilter || status === statusFilter;
            return matchesSearch && matchesStatus;
        });
        
        this.renderTable(filtered);
    },
    
    async save(event) {
        event.preventDefault();
        
        const data = {
            seiNumber: document.getElementById('seiNumber').value,
            date: document.getElementById('date').value,
            origin: document.getElementById('origin').value,
            responsible: document.getElementById('responsible').value,
            subject: document.getElementById('subject').value,
            section: document.getElementById('section').value,
            status: 'Aguardando Envio',
            tramitations: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: authManager.currentUser.email
        };
        
        const firstDestination = document.getElementById('firstDestination').value;
        const firstTramitationDate = document.getElementById('firstTramitationDate').value || new Date().toISOString().split('T')[0];
        const firstDocumentNumber = document.getElementById('firstDocumentNumber').value;
        
        if (firstDestination) {
            data.tramitations.push({
                type: 'envio',
                destination: firstDestination,
                date: firstTramitationDate,
                documentNumber: firstDocumentNumber,
                observation: 'Primeira tramitação',
                registeredBy: authManager.currentUser.email,
                registeredAt: new Date().toISOString()
            });
        }
        
        try {
            await db.collection('seis').add(data);
            customModals.showAlert('SEI cadastrado com sucesso!', 'success');
            seiApp.showDocuments();
        } catch (error) {
            customModals.showAlert('Erro ao salvar: ' + error.message, 'error');
        }
    },
    
    async delete(id) {
        const confirmed = await customModals.showConfirm(
            'Excluir este SEI e todo seu histórico de tramitações?',
            'Excluir',
            'Cancelar',
            true
        );
        
        if (confirmed) {
            try {
                await db.collection('seis').doc(id).delete();
                this.load();
            } catch (error) {
                customModals.showAlert('Erro ao excluir: ' + error.message, 'error');
            }
        }
    }
};