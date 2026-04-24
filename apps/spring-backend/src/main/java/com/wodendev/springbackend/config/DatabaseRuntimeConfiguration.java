package com.wodendev.springbackend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration
public class DatabaseRuntimeConfiguration {
    @Bean
    public DatabaseRuntimeDescriptor databaseRuntimeDescriptor(Environment env) {
        return DatabaseRuntimeDescriptorFactory.resolve(env);
    }
}
