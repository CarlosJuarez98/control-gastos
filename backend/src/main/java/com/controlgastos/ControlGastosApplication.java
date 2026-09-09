package com.controlgastos;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class ControlGastosApplication {

    public static void main(String[] args) {
        SpringApplication.run(ControlGastosApplication.class, args);
    }
}
