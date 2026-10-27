# InfraScan: Google Colab Baseline Crack Classification Pipeline

This folder contains the complete, production-ready Google Colab training notebook for the **InfraScan Baseline Crack Classification Model** (Milestone 2: Week 3 & 4), equipped with **Google Drive persistent checkpointing and automated session resumption**.

---

## 📁 Folder Contents

| File | Description |
|---|---|
| [`InfraScan_Baseline_Crack_Classification.ipynb`](./InfraScan_Baseline_Crack_Classification.ipynb) | Complete Jupyter notebook ready to upload and run on Google Colab. |
| `README.md` | This usage guide, checkpoint architecture, and deployment documentation. |

---

## 🚀 How to Run in Google Colab

### Option 1: Direct Upload
1. Navigate to [Google Colaboratory](https://colab.research.google.com/).
2. Click **File → Upload notebook** (or drag and drop [`InfraScan_Baseline_Crack_Classification.ipynb`](./InfraScan_Baseline_Crack_Classification.ipynb)).
3. In the top menu, go to **Runtime → Change runtime type**.
4. Set **Hardware accelerator** to **T4 GPU** (or V100/A100 if on Colab Pro).
5. Click **Save** and then **Runtime → Run all**.

### Option 2: Upload via Google Drive
1. Create a folder in Google Drive (e.g. `InfraScan_Colab`).
2. Upload [`InfraScan_Baseline_Crack_Classification.ipynb`](./InfraScan_Baseline_Crack_Classification.ipynb) to that folder.
3. Right click the file → **Open with → Google Colaboratory**.

---

## 💾 Google Drive Persistence & Auto-Resume Architecture

### 1. Persistent Directory Layout
When executed in Google Colab, the notebook automatically mounts Google Drive and establishes the following directory structure under:
```
/content/drive/MyDrive/InfraScan_Colab/baseline_crack_classification/
├── checkpoints/
│   ├── infrascan_crack_resnet18_latest.pth   # Atomic checkpoint saved every epoch
│   ├── infrascan_crack_resnet18_best.pth     # Best model weights (highest Val F1)
│   └── infrascan_crack_resnet18_history.json # JSON log of loss & metrics
├── models/
│   ├── infrascan_crack_classifier.onnx       # Production ONNX model for FastAPI backend
│   ├── infrascan_crack_classifier_torchscript.pt # Serialized TorchScript graph
│   ├── infrascan_crack_resnet18_weights.pth  # Pure PyTorch state_dict
│   └── model_metadata.json                   # Input specs, thresholds & metrics
└── outputs/
    ├── sample_concrete_images.png            # Visual dataset verification samples
    ├── training_curves.png                   # Train/Val Loss, Acc & F1 curves
    ├── confusion_matrix.png                  # Annotated test set confusion matrix
    ├── gradcam_explanations.png              # Grad-CAM attention heatmap overlays
    └── test_evaluation_report.csv            # Detailed evaluation performance table
```

### 2. How Auto-Resume Works When Colab Limits Are Reached
Google Colab free sessions frequently time out after 12 hours or disconnect when browser tabs are closed.
The notebook uses a custom `DriveCheckpointManager`:
1. **Atomic Disk Writes**: Every epoch writes state to a `.tmp` file and atomically renames it. Even if a timeout strikes mid-write, the existing checkpoint remains uncorrupted.
2. **State Preserved**:
   - Current epoch index
   - Model `state_dict`
   - Optimizer `state_dict` (AdamW momentum & variance)
   - Learning rate scheduler `state_dict` (CosineAnnealingLR position)
   - Mixed-precision scaler `state_dict`
   - Complete historical train/val losses and F1 scores
3. **Seamless Continuation**:
   When you reopen the notebook and run all cells, Section 3 and Section 8 detect `infrascan_crack_resnet18_latest.pth`:
   ```text
   🔄 Found existing checkpoint: infrascan_crack_resnet18_latest.pth
   ✅ Successfully resumed from Epoch 7 (Best Val F1: 0.9824)
   🚀 Starting training from Epoch 8 to 10...
   ```
   If all 10 epochs have already finished, it skips training and directly proceeds to test set evaluation, Grad-CAM generation, and ONNX export.

---

## 🔍 Model Architecture & Evaluation Protocol

- **Backbone**: Pretrained **ResNet-18** (ImageNet-1K V1 weights).
- **Head**: Dropout(p=0.3) + Linear(512, 2) binary output.
- **Data Augmentation**:
  - Horizontal & Vertical Random Flips (50% probability)
  - Random Affine Rotation (±15°)
  - Color Jitter (brightness ±0.2, contrast ±0.2) to simulate direct sunlight, overcast weather, and bridge shadows.
- **Evaluation Metrics (Held-Out 15% Test Set)**:
  - Accuracy
  - Precision (Positive crack rate)
  - Recall / Sensitivity (Defect detection rate)
  - Specificity (Correctly identifying clean concrete)
  - Macro F1-Score & Weighted F1-Score
  - ROC-AUC Score
  - Confusion Matrix
- **Explainable AI (Grad-CAM)**:
  - Hooks registered to `layer4[-1].conv2`.
  - Calculates gradient-weighted spatial heatmaps and overlays them as a colormapped mask over the concrete image so engineers can verify the neural network is looking at genuine surface fissures rather than image noise.

---

## 🚢 Integrating Trained Models into the InfraScan FastAPI Backend

Once training completes:
1. Download `infrascan_crack_classifier.onnx` and `model_metadata.json` from your Google Drive (`MyDrive/InfraScan_Colab/baseline_crack_classification/models/`).
2. Place them into `apps/api/app/models/weights/`.
3. Load the model using `onnxruntime` inside `apps/api/app/services/` for fast (< 20ms) CPU/GPU inference during image upload!
