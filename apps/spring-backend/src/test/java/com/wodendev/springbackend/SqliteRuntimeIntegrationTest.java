package com.wodendev.springbackend;

import com.wodendev.springbackend.config.DatabaseRuntimeDescriptor;
import com.wodendev.springbackend.entity.Task;
import com.wodendev.springbackend.service.Schema;
import com.wodendev.springbackend.service.TaskService;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
class SqliteRuntimeIntegrationTest {
    private static final Path tempDirectory;
    private static final Path databasePath;

    static {
        try {
            tempDirectory = Files.createTempDirectory("spring-sqlite-runtime-");
            databasePath = tempDirectory.resolve("database.sqlite3");
        } catch (IOException error) {
            throw new RuntimeException("Failed to initialize sqlite integration test paths", error);
        }
    }

    @Autowired
    private DatabaseRuntimeDescriptor runtime;

    @Autowired
    private Schema schema;

    @Autowired
    private TaskService taskService;

    @AfterAll
    static void cleanupPaths() throws IOException {
        if (tempDirectory != null && Files.exists(tempDirectory)) {
            try (Stream<Path> paths = Files.walk(tempDirectory)) {
                paths.sorted(Comparator.reverseOrder())
                        .forEach(path -> {
                            try {
                                Files.deleteIfExists(path);
                            } catch (IOException ignored) {
                            }
                        });
            }
        }
    }

    @DynamicPropertySource
    static void registerProperties(DynamicPropertyRegistry registry) {
        registry.add("DATABASE_PATH", () -> databasePath.toString());
        registry.add("spring.datasource.url", () -> "jdbc:h2:mem:should-not-win");
    }

    @Test
    void usesSqliteRuntimeMetadataWhenDatabasePathOverridesH2() {
        String diagnostic = SpringBackendApplication.describeDatabaseRuntime(runtime);

        assertTrue(runtime.isSqlite());
        assertTrue(schema.isSqlite());
        assertTrue(diagnostic.contains("Database runtime: sqlite"));
        assertTrue(diagnostic.contains(databasePath.toString()));
    }

    @Test
    void persistsTaskToSqliteWhenDatabasePathOverridesH2() {
        Task task = new Task();
        task.setText("native feasibility");
        task.setDay("2026-04-23");
        task.setReminder(true);

        Task created = taskService.create(task);
        Task reloaded = taskService.findOne(created.getId()).orElseThrow();

        assertNotNull(created.getId());
        assertEquals(task.getId(), created.getId());
        assertTrue(Files.exists(databasePath));
        assertNotNull(created.getCreatedAt());
        assertNotNull(created.getUpdatedAt());
        assertEquals(task.getText(), reloaded.getText());
        assertEquals(task.getDay(), reloaded.getDay());
        assertEquals(task.isReminder(), reloaded.isReminder());
        assertNotNull(reloaded.getCreatedAt());
        assertNotNull(reloaded.getUpdatedAt());
    }
}
