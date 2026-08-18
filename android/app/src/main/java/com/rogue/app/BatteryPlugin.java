package com.rogue.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;

/**
 * Plugin nativo para solicitar la exención de optimización de batería.
 *
 * Android mata los servicios en segundo plano (incluyendo el Foreground Service
 * de GPS) cuando la app está "optimizada". Este plugin abre el diálogo del
 * sistema que permite al usuario eximir la app de esa optimización, lo que
 * garantiza que el GPS siga grabando aunque la pantalla esté apagada.
 *
 * Se llama UNA SOLA VEZ, la primera vez que el usuario inicia el tracking.
 * Si el permiso ya está concedido, no hace nada.
 */
@CapacitorPlugin(name = "Battery")
public class BatteryPlugin extends Plugin {

    /**
     * Comprueba si la app está exenta de optimización de batería.
     * Devuelve { "exempt": true/false }.
     */
    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getContext().getSystemService(android.content.Context.POWER_SERVICE);
            String pkg = getContext().getPackageName();
            ret.put("exempt", pm != null && pm.isIgnoringBatteryOptimizations(pkg));
        } else {
            // Pre-Android 6: no hay optimización de batería que preocupe.
            ret.put("exempt", true);
        }
        call.resolve(ret);
    }

    /**
     * Abre el diálogo del sistema para eximir la app de la optimización de batería.
     * Solo tiene efecto si aún no está exenta.
     * Requiere el permiso REQUEST_IGNORE_BATTERY_OPTIMIZATIONS en el Manifest.
     */
    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getContext().getSystemService(android.content.Context.POWER_SERVICE);
            String pkg = getContext().getPackageName();
            if (pm != null && !pm.isIgnoringBatteryOptimizations(pkg)) {
                try {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + pkg));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(intent);
                } catch (Exception e) {
                    // Si el intent falla (algunos ROMs no lo soportan), abre
                    // la pantalla de ajustes de optimización de batería general.
                    try {
                        Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                        fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        getContext().startActivity(fallback);
                    } catch (Exception ignored) {}
                }
            }
        }
        call.resolve();
    }
}
