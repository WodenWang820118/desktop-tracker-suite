package com.wodendev.springbackend;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import com.wodendev.springbackend.controller.HealthController;

@SpringBootTest(properties = { "DATABASE_PATH=" })
class HealthControllerTest {

    @Autowired
    private HealthController healthController;

    @Test
    void returnsHealthyStatusPayload() {
        Map<String, String> response = healthController.check();

        assertEquals("ok", response.get("status"));
        assertEquals("Backend is up and running", response.get("message"));
    }
}
