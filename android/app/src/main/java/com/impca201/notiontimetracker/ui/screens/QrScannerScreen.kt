package com.impca201.notiontimetracker.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.OptIn as AnnotationOptIn
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.gson.Gson
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.impca201.notiontimetracker.R
import com.impca201.notiontimetracker.data.models.ThemeMode
import com.impca201.notiontimetracker.data.models.Workspace
import java.util.concurrent.Executors

data class QrSettingsPayload(
    val apiKey: String? = null,
    val workspaces: List<Workspace>? = null,
    val theme: String? = null
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QrScannerScreen(
    onBack: () -> Unit,
    onImport: (apiKey: String?, workspaces: List<Workspace>?, theme: ThemeMode?) -> Unit
) {
    val context = LocalContext.current
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        )
    }
    var scanned by remember { mutableStateOf(false) }
    var errorMsg by remember { mutableStateOf<String?>(null) }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> hasCameraPermission = granted }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.qr_scan_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = stringResource(R.string.btn_back))
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier.padding(padding).fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            when {
                !hasCameraPermission -> {
                    Spacer(Modifier.height(32.dp))
                    Text(
                        stringResource(R.string.qr_permission_denied),
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(16.dp)
                    )
                }
                scanned -> {
                    Spacer(Modifier.height(32.dp))
                    if (errorMsg != null) {
                        Text(
                            errorMsg!!,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(16.dp)
                        )
                        Spacer(Modifier.height(8.dp))
                        Button(onClick = onBack) { Text(stringResource(R.string.btn_back)) }
                    } else {
                        Text(
                            stringResource(R.string.qr_import_success),
                            color = MaterialTheme.colorScheme.tertiary,
                            modifier = Modifier.padding(16.dp)
                        )
                        Spacer(Modifier.height(8.dp))
                        Button(onClick = onBack) { Text(stringResource(R.string.btn_back)) }
                    }
                }
                else -> {
                    Text(
                        stringResource(R.string.qr_scan_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                    )
                    CameraPreview(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f),
                        onQrDetected = { raw ->
                            if (!scanned) {
                                scanned = true
                                try {
                                    val payload = Gson().fromJson(raw, QrSettingsPayload::class.java)
                                    val theme = when (payload.theme?.uppercase()) {
                                        "LIGHT" -> ThemeMode.LIGHT
                                        "DARK" -> ThemeMode.DARK
                                        "AUTO" -> ThemeMode.AUTO
                                        else -> null
                                    }
                                    onImport(payload.apiKey, payload.workspaces, theme)
                                } catch (e: Exception) {
                                    errorMsg = context.getString(R.string.qr_import_error)
                                }
                            }
                        }
                    )
                }
            }
        }
    }
}

@AnnotationOptIn(ExperimentalGetImage::class)
@Composable
private fun CameraPreview(
    modifier: Modifier = Modifier,
    onQrDetected: (String) -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val executor = remember { Executors.newSingleThreadExecutor() }

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            val previewView = PreviewView(ctx)
            val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
            cameraProviderFuture.addListener({
                val cameraProvider = cameraProviderFuture.get()
                val preview = Preview.Builder().build().also {
                    it.setSurfaceProvider(previewView.surfaceProvider)
                }
                val scanner = BarcodeScanning.getClient()
                val analysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                    .also { ia ->
                        ia.setAnalyzer(executor) { imageProxy ->
                            val mediaImage = imageProxy.image
                            if (mediaImage != null) {
                                val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
                                scanner.process(image)
                                    .addOnSuccessListener { barcodes ->
                                        barcodes.firstOrNull { it.format == Barcode.FORMAT_QR_CODE }
                                            ?.rawValue?.let { onQrDetected(it) }
                                    }
                                    .addOnCompleteListener { imageProxy.close() }
                            } else {
                                imageProxy.close()
                            }
                        }
                    }
                runCatching {
                    cameraProvider.unbindAll()
                    cameraProvider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
                }
            }, ContextCompat.getMainExecutor(ctx))
            previewView
        }
    )
}
