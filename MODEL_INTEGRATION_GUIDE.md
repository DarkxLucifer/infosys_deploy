# InfraScan: Model Integration & Inspection Quick Reference

This repository integrates **InfraScan Model v1.0 — Crack Classification (ResNet50)** with FastAPI, OpenCV classical quality analysis, and the React 19 inspection frontend.

For the comprehensive engineering report, see [docs/AI_MODEL_INTEGRATION_AND_INSPECTION_WORKFLOW_REPORT.md](file:///D:/project/aiml%20prime/project/infosys/docs/AI_MODEL_INTEGRATION_AND_INSPECTION_WORKFLOW_REPORT.md).

---

## Quick Start on Windows

### 1. Python Environment
Always use the virtual environment located at `D:\project\aiml prime\.venv`:
```powershell
# Interpreter
D:\project\aiml prime\.venv\Scripts\python.exe
```

### 2. Run Backend API
```powershell
cd "D:\project\aiml prime\project\infosys\apps\api"
& "D:\project\aiml prime\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
- API Docs: `http://localhost:8000/docs`
- Model Status: `http://localhost:8000/api/v1/models/active`

### 3. Run Frontend
```powershell
cd "D:\project\aiml prime\project\infosys\frontend"
npm run dev
```
- Web Application: `http://localhost:5173`

### 4. Run Pytest Suite
```powershell
cd "D:\project\aiml prime\project\infosys"
& "D:\project\aiml prime\.venv\Scripts\python.exe" -m pytest apps/api/tests/test_model_integration.py apps/api/tests/test_image_quality.py apps/api/tests/test_role_completeness.py -v
```
*(All 24 automated tests pass 100%)*

---

## Model Contract Summary

- **Artifact**: `infrascan_crack_resnet50.onnx` located at `C:\Users\yashr\Downloads\infrascan_crack_results\models`
- **Architecture**: ResNet-50 (50 layers)
- **Task**: Binary Classification (`["Uncracked", "Cracked"]`)
- **Input Tensor**: `(1, 3, 224, 224)` RGB normalized with ImageNet mean `[0.485, 0.456, 0.406]` and std `[0.229, 0.224, 0.225]`
- **Calibrated Decision Threshold**: `0.09509705752134323` (Softmax probability on class 1 $\ge$ threshold classifies as Crack)
- **Hardware Engine**: ONNX Runtime with CPUExecutionProvider and CUDA fallback.
