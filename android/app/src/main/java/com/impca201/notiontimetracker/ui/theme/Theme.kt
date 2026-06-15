package com.impca201.notiontimetracker.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import com.impca201.notiontimetracker.data.models.ThemeMode

private val DarkColorScheme = darkColorScheme(
    primary = Red400,
    onPrimary = Zinc900,
    primaryContainer = Red600,
    onPrimaryContainer = Zinc50,
    secondary = Zinc400,
    onSecondary = Zinc900,
    secondaryContainer = Zinc700,
    onSecondaryContainer = Zinc100,
    tertiary = Green400,
    onTertiary = Zinc900,
    background = Zinc900,
    onBackground = Zinc100,
    surface = Zinc800,
    onSurface = Zinc100,
    surfaceVariant = Zinc700,
    onSurfaceVariant = Zinc400,
    outline = Zinc600,
    error = Red400,
    onError = Zinc900
)

private val LightColorScheme = lightColorScheme(
    primary = Red600,
    onPrimary = Zinc50,
    primaryContainer = Red400,
    onPrimaryContainer = Zinc900,
    secondary = Zinc600,
    onSecondary = Zinc50,
    secondaryContainer = Zinc200,
    onSecondaryContainer = Zinc900,
    tertiary = Green600,
    onTertiary = Zinc50,
    background = Zinc50,
    onBackground = Zinc900,
    surface = Zinc100,
    onSurface = Zinc900,
    surfaceVariant = Zinc200,
    onSurfaceVariant = Zinc600,
    outline = Zinc300,
    error = Red700,
    onError = Zinc50
)

/** True when the device supports Material You dynamic color (Android 12+). */
val dynamicColorSupported: Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

@Composable
fun NotionTimeTrackerTheme(
    themeMode: ThemeMode = ThemeMode.AUTO,
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    val useDark = when (themeMode) {
        ThemeMode.DARK -> true
        ThemeMode.LIGHT -> false
        ThemeMode.AUTO -> isSystemInDarkTheme()
    }
    val context = LocalContext.current
    val colorScheme = when {
        dynamicColor && dynamicColorSupported ->
            if (useDark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        useDark -> DarkColorScheme
        else -> LightColorScheme
    }
    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
