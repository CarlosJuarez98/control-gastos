package com.controlgastos.config;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class SpaForwardController {

    @GetMapping(value = {
            "/",
            "/resumen",
            "/ingresos",
            "/gastos",
            "/mensuales",
            "/cuentas",
            "/cuentas/**",
            "/saldo"
    })
    public String forwardSpa() {
        return "forward:/index.html";
    }
}
