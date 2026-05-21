/**
 * Podcaster Threads Logic
 * Maneja múltiples versiones de chat y guion dentro de una misma sesión.
 */
(function () {

    /**
     * Sincroniza el estado actual de la sesión hacia el thread activo.
     * Realiza migración automática si la sesión no tiene threads.
     */
    function syncActiveThreadToSession(session) {
        if (!session) return;
        if (!session.threads) session.threads = [];

        // Migración: Crear el primer thread con la data actual si no existe ninguno
        if (session.threads.length === 0) {
            const initialThread = {
                id: 'thread-' + Date.now(),
                name: 'Versión 1',
                chat: JSON.parse(JSON.stringify(session.chat || [])),
                script: session.script ? JSON.parse(JSON.stringify(session.script)) : null,
                prompt: session.prompt || '',
                videoConfig: session.videoConfig ? JSON.parse(JSON.stringify(session.videoConfig)) : null,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            session.threads.push(initialThread);
            session.activeThreadId = initialThread.id;
        }

        // Sincronizar data actual de la raíz al objeto thread activo
        const activeThread = session.threads.find(t => t.id === session.activeThreadId);
        if (activeThread) {
            activeThread.chat = JSON.parse(JSON.stringify(session.chat || []));
            activeThread.script = session.script ? JSON.parse(JSON.stringify(session.script)) : null;
            activeThread.prompt = session.prompt || '';
            activeThread.videoConfig = session.videoConfig ? JSON.parse(JSON.stringify(session.videoConfig)) : null;
            activeThread.updatedAt = Date.now();
        }
    }

    /**
     * Crea una nueva versión vacía y la activa.
     */
    function createNewThread(session) {
        syncActiveThreadToSession(session);

        const newId = 'thread-' + Date.now();
        const newThread = {
            id: newId,
            name: 'Versión ' + (session.threads.length + 1),
            chat: [],
            script: null,
            prompt: '',
            videoConfig: null,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        session.threads.push(newThread);
        return switchThread(session, newId);
    }

    /**
     * Cambia a una versión específica, restaurando sus datos en la raíz de la sesión.
     */
    function switchThread(session, threadId) {
        syncActiveThreadToSession(session);

        const targetThread = session.threads.find(t => t.id === threadId);
        if (!targetThread) return false;

        session.activeThreadId = targetThread.id;
        session.chat = JSON.parse(JSON.stringify(targetThread.chat || []));
        session.script = targetThread.script ? JSON.parse(JSON.stringify(targetThread.script)) : null;
        session.prompt = targetThread.prompt || '';
        session.videoConfig = targetThread.videoConfig ? JSON.parse(JSON.stringify(targetThread.videoConfig)) : null;

        return true;
    }

    /**
     * Elimina una versión. Si es la activa, cambia a la primera disponible.
     */
    function deleteThread(session, threadId) {
        if (!session.threads || session.threads.length <= 1) return false;

        const index = session.threads.findIndex(t => t.id === threadId);
        if (index === -1) return false;

        const wasActive = session.activeThreadId === threadId;
        session.threads.splice(index, 1);

        if (wasActive) {
            const nextThread = session.threads[0];
            session.activeThreadId = nextThread.id;
            session.chat = JSON.parse(JSON.stringify(nextThread.chat || []));
            session.script = nextThread.script ? JSON.parse(JSON.stringify(nextThread.script)) : null;
            session.prompt = nextThread.prompt || '';
            session.videoConfig = nextThread.videoConfig ? JSON.parse(JSON.stringify(nextThread.videoConfig)) : null;
        }

        return true;
    }

    window.PodcasterThreads = {
        syncActiveThreadToSession,
        createNewThread,
        switchThread,
        deleteThread
    };
})();
