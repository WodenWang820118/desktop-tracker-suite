package com.wodendev.springbackend.config;

import com.wodendev.springbackend.exception.DatabaseInitializationException;
import org.springframework.core.env.Environment;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

public final class DatabaseRuntimeDescriptorFactory {
    private static final String SQLITE_PREFIX = "jdbc:sqlite:";
    private static final String DEFAULT_H2_URL =
            "jdbc:h2:mem:springdb;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE";
    private static final List<Path> SQLITE_CANDIDATES = List.of(
            Paths.get("database.sqlite3"),
            Paths.get("../database.sqlite3"),
            Paths.get("../../database.sqlite3"),
            Paths.get("../../../database.sqlite3")
    );

    private DatabaseRuntimeDescriptorFactory() {
    }

    public static DatabaseRuntimeDescriptor resolve(Environment env) {
        return resolve(env, SQLITE_CANDIDATES);
    }

    static DatabaseRuntimeDescriptor resolve(Environment env, List<Path> sqliteCandidates) {
        String configuredUrl = env.getProperty("spring.datasource.url");
        String databasePath = env.getProperty("DATABASE_PATH");

        if (hasText(databasePath)) {
            Path resolved = normalize(databasePath);
            validateRequestedSqlitePath(resolved);
            return sqlite(resolved);
        }

        if (hasText(configuredUrl) && configuredUrl.startsWith(SQLITE_PREFIX)) {
            Path resolved = normalize(configuredUrl.substring(SQLITE_PREFIX.length()));
            validateRequestedSqlitePath(resolved);
            return sqlite(resolved);
        }

        for (Path candidate : sqliteCandidates) {
            Path resolved = candidate.toAbsolutePath().normalize();
            if (Files.exists(resolved)) {
                validateExistingSqlitePath(resolved);
                return sqlite(resolved);
            }
        }

        return new DatabaseRuntimeDescriptor(
                DatabaseRuntimeKind.H2,
                hasText(configuredUrl) ? configuredUrl : DEFAULT_H2_URL,
                null
        );
    }

    private static DatabaseRuntimeDescriptor sqlite(Path databasePath) {
        return new DatabaseRuntimeDescriptor(
                DatabaseRuntimeKind.SQLITE,
                SQLITE_PREFIX + databasePath,
                databasePath
        );
    }

    private static void validateRequestedSqlitePath(Path databasePath) {
        if (Files.exists(databasePath)) {
            validateExistingSqlitePath(databasePath);
            return;
        }

        Path parentDir = databasePath.getParent();
        if (parentDir != null && !Files.exists(parentDir)) {
            throw new DatabaseInitializationException(
                    "DB_FILE_NOT_FOUND",
                    databasePath.toString(),
                    "Parent directory does not exist for database file"
            );
        }

        if (parentDir != null && !Files.isWritable(parentDir)) {
            throw new DatabaseInitializationException(
                    "DB_PERMISSION_DENIED",
                    databasePath.toString(),
                    "Cannot create database file (parent directory not writable)"
            );
        }
    }

    private static void validateExistingSqlitePath(Path databasePath) {
        if (!Files.isReadable(databasePath) || !Files.isWritable(databasePath)) {
            throw new DatabaseInitializationException(
                    "DB_PERMISSION_DENIED",
                    databasePath.toString(),
                    "SQLite database file is not readable/writable"
            );
        }
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static Path normalize(String rawPath) {
        return Paths.get(rawPath).toAbsolutePath().normalize();
    }
}
