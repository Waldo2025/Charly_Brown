/**
 * Podcaster Threads Logic
 * Maneja múltiples versiones de chat y guion dentro de una misma sesión.
 */
(function () {
    function cloneValue(value, fallback = null) {
        try {
            return JSON.parse(JSON.stringify(value ?? fallback));
        } catch (_) {
            return fallback;
        }
    }

    function createThreadId(session) {
        const existing = new Set((Array.isArray(session?.threads) ? session.threads : []).map(t => String(t?.id || "").trim()).filter(Boolean));
        let id = `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        while (existing.has(id)) {
            id = `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        }
        return id;
    }

    function getNextThreadVersionNumber(session) {
        const threads = Array.isArray(session?.threads) ? session.threads : [];
        const maxVersion = threads.reduce((max, thread, index) => {
            const match = String(thread?.name || "").match(/versi[oó]n\s+(\d+)/i);
            const parsed = match ? Number(match[1]) : index + 1;
            return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
        }, 0);
        return maxVersion + 1;
    }

    /**
     * Sincroniza el estado actual de la sesión hacia el thread activo.
     * Realiza migración automática si la sesión no tiene threads.
     */
    function syncActiveThreadToSession(session) {
        if (!session) return;
        if (!Array.isArray(session.threads)) session.threads = [];

        // Migración: Crear el primer thread con la data actual si no existe ninguno
        if (session.threads.length === 0) {
            const initialThread = {
                id: createThreadId(session),
                name: 'Versión 1',
                chat: cloneValue(session.chat || [], []),
                script: session.script ? cloneValue(session.script, null) : null,
                prompt: session.prompt || '',
                videoConfig: session.videoConfig ? cloneValue(session.videoConfig, null) : null,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            session.threads.push(initialThread);
            session.activeThreadId = initialThread.id;
        }

        if (!session.activeThreadId || !session.threads.some(t => t.id === session.activeThreadId)) {
            session.activeThreadId = session.threads[0]?.id || "";
        }

        // Sincronizar data actual de la raíz al objeto thread activo
        const activeThread = session.threads.find(t => t.id === session.activeThreadId);
        if (activeThread) {
            activeThread.chat = cloneValue(session.chat || [], []);
            activeThread.script = session.script ? cloneValue(session.script, null) : null;
            activeThread.prompt = session.prompt || '';
            activeThread.videoConfig = session.videoConfig ? cloneValue(session.videoConfig, null) : null;
            activeThread.updatedAt = Date.now();
        }
    }

    function restoreThreadToSession(session, targetThread) {
        if (!session || !targetThread) return false;
        session.activeThreadId = targetThread.id;
        session.chat = cloneValue(targetThread.chat || [], []);
        session.script = targetThread.script ? cloneValue(targetThread.script, null) : null;
        session.prompt = targetThread.prompt || '';
        session.videoConfig = targetThread.videoConfig ? cloneValue(targetThread.videoConfig, null) : null;
        return true;
    }

    /**
     * Crea una nueva versión vacía y la activa.
     */
    function createNewThread(session) {
        syncActiveThreadToSession(session);

        const newId = createThreadId(session);
        const newThread = {
            id: newId,
            name: 'Versión ' + getNextThreadVersionNumber(session),
            chat: [],
            script: null,
            prompt: '',
            videoConfig: null,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        session.threads.push(newThread);
        return restoreThreadToSession(session, newThread);
    }

    /**
     * Cambia a una versión específica, restaurando sus datos en la raíz de la sesión.
     */
    function switchThread(session, threadId) {
        syncActiveThreadToSession(session);

        const targetThread = session.threads.find(t => t.id === threadId);
        if (!targetThread) return false;

        return restoreThreadToSession(session, targetThread);
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
            restoreThreadToSession(session, nextThread);
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
