package com.rogue.app;

import android.graphics.Color;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BatteryPlugin.class);
        super.onCreate(savedInstanceState);

        // El escaner de codigos de barras (ML Kit) pinta la vista de camara
        // DETRAS del WebView; la app se "aparta" poniendo html+body
        // transparentes (globals.css: .barcode-scanner-active).
        //
        // Eso NO basta en Android: el WebView dibuja ademas su propio color de
        // fondo, opaco por defecto, asi que la camara quedaba tapada y parecia
        // que el escaner no se abria. Hay que declararlo transparente aqui.
        //
        // Es seguro dejarlo permanente: `body` siempre pinta var(--background),
        // por lo que fuera del escaner la app se ve exactamente igual.
        getBridge().getWebView().setBackgroundColor(Color.TRANSPARENT);
    }
}
