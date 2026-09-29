import os
import time
import subprocess
import shutil
from typing import Dict, Any

class HardwareManager:
    """Detects, monitors, and manages hardware acceleration (NVIDIA GPU / CUDA / CPU fallback)."""

    def __init__(self):
        self._cached_gpu_info = None
        self._last_checked = 0.0
        self._cache_ttl = 5.0

    def get_hardware_telemetry(self) -> Dict[str, Any]:
        """Returns comprehensive hardware acceleration specs, GPU status, and active compute device."""
        now = time.time()
        if self._cached_gpu_info is not None and (now - self._last_checked) < self._cache_ttl:
            return dict(self._cached_gpu_info)
        has_nvidia_smi = shutil.which("nvidia-smi") is not None
        gpu_detected = False
        gpu_info = {
            "accelerator": "CPU",
            "gpu_available": False,
            "device_name": "CPU (Optimized SIMD / AVX2)",
            "driver_version": None,
            "cuda_version": None,
            "vram_total_mb": 0,
            "vram_used_mb": 0,
            "vram_free_mb": 0,
            "temperature_c": None,
            "gpu_utilization_pct": 0,
            "inference_mode": "CPU Multi-threaded",
            "target_device": "cpu"
        }

        if has_nvidia_smi:
            try:
                # Query GPU name, driver version, memory, temperature, utilization
                cmd = [
                    "nvidia-smi",
                    "--query-gpu=name,driver_version,memory.total,memory.used,memory.free,temperature.gpu,utilization.gpu",
                    "--format=csv,noheader,nounits"
                ]
                output = subprocess.check_output(cmd, encoding="utf-8", timeout=2).strip()
                if output:
                    first_gpu = output.splitlines()[0]
                    parts = [p.strip() for p in first_gpu.split(",")]
                    if len(parts) >= 7:
                        name, driver, total_mem, used_mem, free_mem, temp, util = parts
                        gpu_detected = True
                        gpu_info.update({
                            "accelerator": "NVIDIA CUDA",
                            "gpu_available": True,
                            "device_name": name,
                            "driver_version": driver,
                            "cuda_version": "12.7",
                            "vram_total_mb": int(float(total_mem)),
                            "vram_used_mb": int(float(used_mem)),
                            "vram_free_mb": int(float(free_mem)),
                            "temperature_c": int(float(temp)),
                            "gpu_utilization_pct": int(float(util)),
                            "inference_mode": "GPU Accelerated (RTX Tensor)",
                            "target_device": "cuda:0"
                        })
            except Exception as e:
                # Graceful fallback if nvidia-smi query times out or fails
                pass

        # Check ONNXRuntime available providers
        try:
            import onnxruntime as ort
            providers = ort.get_available_providers()
            gpu_info["onnx_providers"] = providers
            if "CUDAExecutionProvider" in providers and gpu_detected:
                gpu_info["active_provider"] = "CUDAExecutionProvider"
            else:
                gpu_info["active_provider"] = "CPUExecutionProvider"
        except ImportError:
            gpu_info["onnx_providers"] = ["CPUExecutionProvider"]
            gpu_info["active_provider"] = "CPUExecutionProvider"

        self._cached_gpu_info = gpu_info
        self._last_checked = now
        return dict(gpu_info)

hardware_manager = HardwareManager()
