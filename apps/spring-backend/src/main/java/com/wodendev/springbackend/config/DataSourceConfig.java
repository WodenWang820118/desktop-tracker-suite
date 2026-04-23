package com.wodendev.springbackend.config;

import org.springframework.context.annotation.DependsOn;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.sqlite.SQLiteDataSource;
import org.h2.jdbcx.JdbcDataSource;

import javax.sql.DataSource;

@Configuration
public class DataSourceConfig {

    @Bean
    @DependsOn("databaseRuntimeDescriptor")
    public DataSource dataSource(
            DatabaseRuntimeDescriptor runtime,
            Environment env
    ) {
        if (runtime.isSqlite()) {
            SQLiteDataSource dataSource = new SQLiteDataSource();
            dataSource.setUrl(runtime.jdbcUrl());
            return dataSource;
        }

        JdbcDataSource dataSource = new JdbcDataSource();
        dataSource.setURL(runtime.jdbcUrl());
        dataSource.setUser(env.getProperty("spring.datasource.username", "sa"));
        dataSource.setPassword(env.getProperty("spring.datasource.password", ""));
        return dataSource;
    }
}
