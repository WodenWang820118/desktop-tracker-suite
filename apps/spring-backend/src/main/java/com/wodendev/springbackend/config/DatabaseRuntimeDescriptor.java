package com.wodendev.springbackend.config;

import java.nio.file.Path;

public record DatabaseRuntimeDescriptor(
        DatabaseRuntimeKind kind,
        String jdbcUrl,
        Path databasePath
) {
    public boolean isSqlite() {
        return kind == DatabaseRuntimeKind.SQLITE;
    }

    public String logPath() {
        return databasePath != null ? databasePath.toString() : "in-memory";
    }
}
