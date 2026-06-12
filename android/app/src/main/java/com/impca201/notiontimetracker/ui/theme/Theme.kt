package com.impca201.notiontimetracker.ui.theme

import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

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

@Composable
fun NotionTimeTrackerTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = Typography,
        content = content
    )
}
