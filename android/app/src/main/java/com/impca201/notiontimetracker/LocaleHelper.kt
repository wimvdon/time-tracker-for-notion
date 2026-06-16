package com.impca201.notiontimetracker

import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.os.LocaleList
import java.util.Locale

object LocaleHelper {
    fun wrap(context: Context, localeCode: String): Context {
        if (localeCode == "system" || localeCode.isBlank()) {
            return context
        }
        val locale = when (localeCode) {
            "en" -> Locale.ENGLISH
            "nl" -> Locale("nl")
            "fr" -> Locale.FRENCH
            "de" -> Locale.GERMAN
            "es" -> Locale("es")
            "it" -> Locale.ITALIAN
            else -> Locale(localeCode)
        }
        Locale.setDefault(locale)
        val config = Configuration(context.resources.configuration)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            config.setLocales(LocaleList(locale))
        } else {
            @Suppress("DEPRECATION")
            config.locale = locale
        }
        return context.createConfigurationContext(config)
    }
}
