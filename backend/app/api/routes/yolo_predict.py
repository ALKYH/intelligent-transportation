from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import os
import tempfile
import traceback
from ultralytics import YOLO

router = APIRouter(prefix="/yolo", tags=["yolo_predict"])

# 默认模型路径，可根据实际情况修改
MODEL_PATH = os.getenv("YOLOV8N_MODEL_PATH", "app/models/road_defect/best.pt")

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