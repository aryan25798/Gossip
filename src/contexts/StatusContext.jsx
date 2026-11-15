import React, { createContext, useContext, useState, useMemo } from 'react';

const StatusContext = createContext();

export function useStatus() {
    return useContext(StatusContext);
}

export function StatusProvider({ children }) {
    const [statuses, setStatuses] = useState([]);
    const [loading, setLoading] = useState(false);

    const value = useMemo(() => ({
        statuses,
        loading,
        uploadStatus: async () => {},
        deleteStatus: async () => {}
    }), [statuses, loading]);

    return (
        <StatusContext.Provider value={value}>
            {children}
        </StatusContext.Provider>
    );
}
