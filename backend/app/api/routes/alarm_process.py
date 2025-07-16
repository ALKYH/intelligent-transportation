from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
from sqlmodel import Session, select
from app.models import RoadSurfaceDetection
from app.core.db import engine
from ultralytics import YOLO
import os
import tempfile
import traceback

router = APIRouter(prefix="/alarm", tags=["alarm_process"])

# 默认模型路径
MODEL_PATH = os.getenv("YOLOV8N_MODEL_PATH", "app/models/road_defect/best.pt")

@router.post("/process")
def process_alarm(
    alarm_id: int = Form(...),
    file: UploadFile = File(...)
):
    """
    处理病害告警：上传修复后图片，模型检测是否修复，若修复则仅将数据库中alarm_status设为True
    """
    try:
        # 查找告警记录
        with Session(engine) as session:
            alarm = session.exec(
                select(RoadSurfaceDetection).where(RoadSurfaceDetection.id == alarm_id)
            ).first()
            if not alarm:
                raise HTTPException(status_code=404, detail="未找到对应告警记录")

            # 保存上传图片
            with tempfile.TemporaryDirectory() as tmpdir:
                filename = file.filename or "repair.jpg"
                img_path = os.path.join(tmpdir, filename)
                with open(img_path, "wb") as f:
                    f.write(file.file.read())

                # 加载模型并检测
                if not os.path.exists(MODEL_PATH):
                    raise HTTPException(status_code=500, detail=f"模型文件未找到: {MODEL_PATH}")
                model = YOLO(MODEL_PATH)
                results = model(img_path)
                detected = False
                for r in results:
                    if len(r.boxes) > 0:
                        detected = True
                        break

                # 判断是否修复
                if not detected:
                    # 认定已修复，仅更新alarm_status
                    alarm.alarm_status = True
                    session.add(alarm)
                    session.commit()
                    return {"alarm_id": alarm_id, "repaired": True, "msg": "病害已修复，告警已处理"}
                else:
                    return {"alarm_id": alarm_id, "repaired": False, "msg": "检测到仍有病害，告警未处理"}

    except Exception as e:
        print("处理告警异常:", str(e))
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "traceback": traceback.format_exc()}
        )
