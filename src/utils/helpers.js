const helpers = {
    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR');
    },
    
    getStatusColor(status) {
        const colors = {
            'Finalizado': 'bg-green-500/20 text-green-400',
            'Enviado': 'bg-blue-500/20 text-blue-400',
            'Respondido': 'bg-yellow-500/20 text-yellow-400',
            'Aguardando Envio': 'bg-gray-500/20 text-gray-400'
        };
        return colors[status] || 'bg-gray-500/20 text-gray-400';
    }
};