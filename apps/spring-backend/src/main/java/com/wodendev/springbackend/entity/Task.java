package com.wodendev.springbackend.entity;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class Task {
    private String id;

    private String text;

    private String day;

    private boolean reminder;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
