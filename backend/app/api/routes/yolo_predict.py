from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import os
import tempfile
import traceback
from ultralytics import YOLO
from typing import List
import cv2
import base64
from app.models import RoadSurfaceDetection
from sqlmodel import Session
from app.core.db import engine

router = APIRouter(prefix="/yolo", tags=["yolo_predict"])

# 默认模型路径，可根据实际情况修改
MODEL_PATH = os.getenv("YOLOV8N_MODEL_PATH", "app/models/road_defect/best.pt")

# 类别名称映射
CLASS_NAMES = {
    0: "纵向裂缝",
    1: "横向裂缝",
    2: "龟裂",
    3: "斜向裂缝",
    4: "修补",
    5: "坑洞"
}
CLASS_NAMES_EN = {
    0: "Longitudinal Crack",
    1: "Transverse Crack",
    2: "Alligator Crack",
    3: "Diagonal Crack",
    4: "Patch",
    5: "Pothole"
}

@router.post("/predict-image")
def predict_image(file: UploadFile = File(...)):
    """
    接收一张图片，直接用 ultralytics YOLOv8 进行预测，返回预测结果（标签、置信度、坐标等）
    """
    try:
        if not os.path.exists(MODEL_PATH):
            raise HTTPException(status_code=500, detail=f"模型文件未找到: {MODEL_PATH}")
        # 保存上传的图片到临时文件
        with tempfile.TemporaryDirectory() as tmpdir:
            filename = file.filename or "input.jpg"
            img_path = os.path.join(tmpdir, filename)
            with open(img_path, "wb") as f:
                f.write(file.file.read())
            # 加载模型
            model = YOLO(MODEL_PATH)
            # 推理
            results = model(img_path)
            # 解析结果
            parsed = []
            for r in results:
                boxes = r.boxes
                for box in boxes:
                    cls_id = int(box.cls[0])
                    conf = float(box.conf[0])
                    xyxy = box.xyxy[0].tolist()  # [x1, y1, x2, y2]
                    parsed.append({
                        "class_id": cls_id,
                        "confidence": conf,
                        "bbox": xyxy
                    })
            return {"results": parsed}
    except Exception as e:
        print("发生异常:", str(e))
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "traceback": traceback.format_exc()}
        )

@router.post("/predict-images")
def predict_images(files: List[UploadFile] = File(...)):
    """
    批量图片检测，返回每张图片的检测结果和带标注框的图片（base64）
    """
    try:
        if not os.path.exists(MODEL_PATH):
            raise HTTPException(status_code=500, detail=f"模型文件未找到: {MODEL_PATH}")
        model = YOLO(MODEL_PATH)
        results_list = []
        for file in files:
            with tempfile.TemporaryDirectory() as tmpdir:
                filename = file.filename or "input.jpg"
                img_path = os.path.join(tmpdir, filename)
                with open(img_path, "wb") as f:
                    f.write(file.file.read())
                # 推理
                results = model(img_path)
                parsed = []
                img = cv2.imread(img_path)
                if img is None:
                    results_list.append({
                        "filename": filename,
                        "results": [],
                        "annotated_image_base64": None,
                        "error": "图片读取失败"
                    })
                    continue
                for r in results:
                    boxes = r.boxes
                    for box in boxes:
                        cls_id = int(box.cls[0])
                        conf = float(box.conf[0])
                        xyxy = box.xyxy[0].tolist()  # [x1, y1, x2, y2]
                        class_name = CLASS_NAMES.get(cls_id, f"未知类别({cls_id})")
                        class_name_en = CLASS_NAMES_EN.get(cls_id, str(cls_id))
                        parsed.append({
                            "class_id": cls_id,
                            "class_name": class_name,
                            "class_name_en": class_name_en,
                            "confidence": conf,
                            "bbox": xyxy
                        })
                        # 画框
                        x1, y1, x2, y2 = map(int, xyxy)
                        cv2.rectangle(img, (x1, y1), (x2, y2), (0,0,255), 2)
                        label = class_name_en
                        cv2.putText(img, label, (x1, y1+16), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,0,255), 2)
                # 转base64
                _, buffer = cv2.imencode('.jpg', img)
                img_base64 = base64.b64encode(buffer).decode()
                img_base64 = f"data:image/jpeg;base64,{img_base64}"
                results_list.append({
                    "filename": filename,
                    "results": parsed,
                    "annotated_image_base64": img_base64
                })
                # === 插入数据库 ===
                with open(img_path, "rb") as f:
                    file_data = f.read()
                file_type = os.path.splitext(filename)[-1].lower().replace('.', '')
                with Session(engine) as session:
                    detection = RoadSurfaceDetection(
                        file_data=file_data,
                        file_type=file_type,
                        disease_info={"results": parsed},
                        alarm_status=False
                    )
                    session.add(detection)
                    session.commit()
        return {"results": results_list}
    except Exception as e:
        print("批量检测异常:", str(e))
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "traceback": traceback.format_exc()}
        )