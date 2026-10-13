package com.impca201.notiontimetracker.ui.components

import android.graphics.Matrix
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asComposePath
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.graphics.shapes.CornerRounding
import androidx.graphics.shapes.RoundedPolygon
import androidx.graphics.shapes.star
import androidx.graphics.shapes.toPath
import com.impca201.notiontimetracker.ui.theme.rememberReducedMotion

/** One full turn of the hero shape while a timer runs. */
private const val ROTATION_PERIOD_MS = 30_000

/**
 * The nine-lobed "cookie" of the Material 3 Expressive shape set (the same shape as Snoozer's
 * toggle), built with androidx.graphics.shapes and scaled to the layout bounds.
 */
private object CookieShape : Shape {
    private val polygon =
        RoundedPolygon.star(
            numVerticesPerRadius = 9,
            radius = 1f,
            innerRadius = 0.86f,
            rounding = CornerRounding(radius = 0.32f, smoothing = 0.6f),
        )

    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val path = polygon.toPath()
        path.transform(
            Matrix().apply {
                setScale(size.width / 2f, size.height / 2f)
                postTranslate(size.width / 2f, size.height / 2f)
            },
        )
        return Outline.Generic(path.asComposePath())
    }
}

/**
 * The running timer: the elapsed time on a slowly turning cookie shape, inside a ring that fills
 * over each minute. It springs in when a timer starts. With animations switched off on the
 * device, it stands still and the ring jumps instead of sweeping.
 */
@Composable
fun TimerHero(
    elapsedText: String,
    elapsedSeconds: Long,
    accent: Color,
    container: Color,
    contentColor: Color,
    modifier: Modifier = Modifier,
) {
    val animate = !rememberReducedMotion()

    val appear = remember { Animatable(if (animate) 0.7f else 1f) }
    LaunchedEffect(Unit) {
        appear.animateTo(1f, spring(dampingRatio = 0.5f, stiffness = Spring.StiffnessLow))
    }

    val rotation = remember { Animatable(0f) }
    LaunchedEffect(animate) {
        if (!animate) return@LaunchedEffect
        while (true) {
            rotation.animateTo(rotation.value + 360f, tween(ROTATION_PERIOD_MS, easing = LinearEasing))
            rotation.snapTo(rotation.value % 360f)
        }
    }

    // Fraction of the current minute; sweeps smoothly to each new second, restarts at the minute.
    val ring = remember { Animatable((elapsedSeconds % 60) / 60f) }
    LaunchedEffect(elapsedSeconds, animate) {
        val target = (elapsedSeconds % 60) / 60f
        if (target < ring.value || !animate) ring.snapTo(target) else ring.animateTo(target, tween(900, easing = LinearEasing))
    }

    Box(
        modifier =
            modifier
                .size(288.dp)
                .graphicsLayer {
                    scaleX = appear.value
                    scaleY = appear.value
                },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.matchParentSize()) {
            val stroke = 8.dp.toPx()
            val inset = stroke / 2
            val arcSize = Size(size.width - stroke, size.height - stroke)
            drawArc(
                color = accent.copy(alpha = 0.18f),
                startAngle = 0f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = Offset(inset, inset),
                size = arcSize,
                style = Stroke(stroke),
            )
            drawArc(
                color = accent,
                startAngle = -90f,
                sweepAngle = ring.value * 360f,
                useCenter = false,
                topLeft = Offset(inset, inset),
                size = arcSize,
                style = Stroke(stroke, cap = StrokeCap.Round),
            )
        }
        Box(
            Modifier
                .matchParentSize()
                .padding(22.dp)
                .graphicsLayer { rotationZ = rotation.value }
                .background(container, CookieShape),
        )
        // Tabular figures keep the digits from shifting as they tick.
        Text(
            elapsedText,
            style = MaterialTheme.typography.displayMedium.copy(fontFeatureSettings = "tnum", fontWeight = FontWeight.Medium),
            color = contentColor,
        )
    }
}
