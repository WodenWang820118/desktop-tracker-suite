package com.wodendev.springbackend.config;

import com.wodendev.springbackend.exception.DatabaseInitializationException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;

class DatabaseRuntimeDescriptorFactoryTest {

    @Test
    void resolvesSqliteWhenDatabasePathIsProvided() {
        Path databasePath = Path.of(System.getProperty("java.io.tmpdir"), "test-database.sqlite3");
        MockEnvironment env = new MockEnvironment()
                .withProperty("DATABASE_PATH", databasePath.toString())
                .withProperty("spring.datasource.url", "jdbc:h2:mem:ignored");

        DatabaseRuntimeDescriptor descriptor = DatabaseRuntimeDescriptorFactory.resolve(env, List.of());

        assertEquals(DatabaseRuntimeKind.SQLITE, descriptor.kind());
        assertTrue(descriptor.jdbcUrl().startsWith("jdbc:sqlite:"));
        assertEquals(databasePath.toAbsolutePath().normalize().toString(), descriptor.logPath());
    }

    @Test
    void resolvesH2WhenDatabasePathIsBlank() {
        MockEnvironment env = new MockEnvironment()
                .withProperty("DATABASE_PATH", "")
                .withProperty("spring.datasource.url", "jdbc:h2:mem:springdb");

        DatabaseRuntimeDescriptor descriptor = DatabaseRuntimeDescriptorFactory.resolve(env, List.of());

        assertEquals(DatabaseRuntimeKind.H2, descriptor.kind());
        assertEquals("jdbc:h2:mem:springdb", descriptor.jdbcUrl());
        assertNull(descriptor.databasePath());
    }

    @Test
    void treatsWhitespaceOnlyDatabasePathAsBlank() {
        MockEnvironment env = new MockEnvironment()
                .withProperty("DATABASE_PATH", "   ")
                .withProperty("spring.datasource.url", "jdbc:h2:mem:springdb");

        DatabaseRuntimeDescriptor descriptor = DatabaseRuntimeDescriptorFactory.resolve(env, List.of());

        assertEquals(DatabaseRuntimeKind.H2, descriptor.kind());
        assertEquals("jdbc:h2:mem:springdb", descriptor.jdbcUrl());
    }

    @Test
    void resolvesSqliteWhenDatasourceUrlPointsAtSqlite() {
        Path databasePath = Path.of(System.getProperty("java.io.tmpdir"), "url-driven-database.sqlite3");
        MockEnvironment env = new MockEnvironment()
                .withProperty("spring.datasource.url", "jdbc:sqlite:" + databasePath);

        DatabaseRuntimeDescriptor descriptor = DatabaseRuntimeDescriptorFactory.resolve(env, List.of());

        assertEquals(DatabaseRuntimeKind.SQLITE, descriptor.kind());
        assertTrue(descriptor.jdbcUrl().startsWith("jdbc:sqlite:"));
        assertTrue(descriptor.jdbcUrl().contains(databasePath.toAbsolutePath().normalize().toString()));
        assertEquals(databasePath.toAbsolutePath().normalize().toString(), descriptor.logPath());
    }

    @Test
    void throwsWhenDatabasePathParentDirectoryDoesNotExist() {
        Path missingParentPath = Path.of(System.getProperty("java.io.tmpdir"))
                .resolve("missing-parent-" + System.nanoTime())
                .resolve("database.sqlite3");
        MockEnvironment env = new MockEnvironment()
                .withProperty("DATABASE_PATH", missingParentPath.toString());

        DatabaseInitializationException exception = assertThrows(
                DatabaseInitializationException.class,
                () -> DatabaseRuntimeDescriptorFactory.resolve(env, List.of())
        );
        assertEquals("DB_FILE_NOT_FOUND", exception.getErrorCode());
        assertEquals(missingParentPath.toAbsolutePath().normalize().toString(), exception.getDatabasePath());
    }

    @Test
    void resolvesSqliteFromCandidateDiscovery() throws Exception {
        Path tempDirectory = Files.createTempDirectory("database-runtime-candidate-");
        Path candidate = tempDirectory.resolve("database.sqlite3");
        Files.createFile(candidate);
        MockEnvironment env = new MockEnvironment()
                .withProperty("spring.datasource.url", "jdbc:h2:mem:springdb");

        try {
            DatabaseRuntimeDescriptor descriptor =
                    DatabaseRuntimeDescriptorFactory.resolve(env, List.of(candidate));

            assertEquals(DatabaseRuntimeKind.SQLITE, descriptor.kind());
            assertEquals(candidate.toAbsolutePath().normalize().toString(), descriptor.logPath());
        } finally {
            Files.deleteIfExists(candidate);
            Files.deleteIfExists(tempDirectory);
        }
    }

    @Test
    void prefersDatabasePathOverDatasourceUrl() {
        Path explicitPath = Path.of(System.getProperty("java.io.tmpdir"), "database-path-wins.sqlite3");
        Path datasourcePath = Path.of(System.getProperty("java.io.tmpdir"), "datasource-url-loses.sqlite3");
        MockEnvironment env = new MockEnvironment()
                .withProperty("DATABASE_PATH", explicitPath.toString())
                .withProperty("spring.datasource.url", "jdbc:sqlite:" + datasourcePath);

        DatabaseRuntimeDescriptor descriptor = DatabaseRuntimeDescriptorFactory.resolve(env, List.of());

        assertEquals(DatabaseRuntimeKind.SQLITE, descriptor.kind());
        assertEquals(explicitPath.toAbsolutePath().normalize().toString(), descriptor.logPath());
        assertTrue(descriptor.jdbcUrl().contains(explicitPath.toAbsolutePath().normalize().toString()));
        assertFalse(descriptor.jdbcUrl().contains(datasourcePath.toAbsolutePath().normalize().toString()));
    }

    @Test
    void usesDefaultH2UrlWhenNothingIsConfigured() {
        MockEnvironment env = new MockEnvironment();

        DatabaseRuntimeDescriptor descriptor = DatabaseRuntimeDescriptorFactory.resolve(env, List.of());

        assertEquals(DatabaseRuntimeKind.H2, descriptor.kind());
        assertEquals(
                "jdbc:h2:mem:springdb;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
                descriptor.jdbcUrl()
        );
        assertNull(descriptor.databasePath());
    }
}
