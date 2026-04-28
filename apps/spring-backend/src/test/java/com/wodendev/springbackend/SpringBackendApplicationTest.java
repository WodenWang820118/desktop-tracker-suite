package com.wodendev.springbackend;

import com.wodendev.springbackend.config.DatabaseRuntimeDescriptor;
import com.wodendev.springbackend.config.DatabaseRuntimeKind;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;

class SpringBackendApplicationTest {

    @Test
    void describesSqliteRuntimeWithPath() {
        Path expectedPath = Path.of(System.getProperty("java.io.tmpdir"), "test.sqlite3");
        DatabaseRuntimeDescriptor runtime = new DatabaseRuntimeDescriptor(
                DatabaseRuntimeKind.SQLITE,
                "jdbc:sqlite:" + expectedPath,
                expectedPath
        );

        String message = SpringBackendApplication.describeDatabaseRuntime(runtime);

        assertEquals("Database runtime: sqlite path=" + expectedPath, message);
    }

    @Test
    void describesH2RuntimeWithUrl() {
        DatabaseRuntimeDescriptor runtime = new DatabaseRuntimeDescriptor(
                DatabaseRuntimeKind.H2,
                "jdbc:h2:mem:springdb",
                null
        );

        String message = SpringBackendApplication.describeDatabaseRuntime(runtime);

        assertEquals("Database runtime: h2 url=jdbc:h2:mem:springdb", message);
    }
}
