package com.wodendev.springbackend;

import com.wodendev.springbackend.config.DatabaseRuntimeDescriptor;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@SpringBootApplication
public class SpringBackendApplication {
    
    private static final Logger logger = LoggerFactory.getLogger(SpringBackendApplication.class);
    
    public static void main(String[] args) {
        SpringApplication.run(SpringBackendApplication.class, args);
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady(ApplicationReadyEvent event) {
        Environment environment = event.getApplicationContext().getEnvironment();
        DatabaseRuntimeDescriptor runtime =
                event.getApplicationContext().getBean(DatabaseRuntimeDescriptor.class);
        String port = environment.getProperty("server.port", "8080");
        logger.info("Spring Backend Application is running on port: {}", port);
        logger.info("Application URL: http://localhost:{}", port);
        logger.info(describeDatabaseRuntime(runtime));
    }

    static String describeDatabaseRuntime(DatabaseRuntimeDescriptor runtime) {
        if (runtime.isSqlite()) {
            return "Database runtime: sqlite path=" + runtime.logPath();
        }

        return "Database runtime: h2 url=" + runtime.jdbcUrl();
    }
}
