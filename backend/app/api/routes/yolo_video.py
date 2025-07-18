from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
import os
import tempfile
import traceback
import cv2
import numpy as np
from pathlib import Path
import shutil
from datetime import datetime
from ultralytics import YOLO
import base64
from app.models import RoadSurfaceDetection
from sqlmodel import Session
from app.core.db import engine
import copy
from app.utils import get_beijing_time

router = APIRouter(prefix="/yolo-video", tags=["yolo_video"])

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

# 设定参考物实际长度和像素长度
PLATE_REAL_LENGTH = 0.45  # 45厘米
PLATE_PIXEL_LENGTH = 105   # 105像素
GSD = PLATE_REAL_LENGTH / PLATE_PIXEL_LENGTH  # 单位：米/像素

def extract_frames(video_path, output_dir, fps=1):
    """
    从视频中提取帧
    Args:
        video_path: 视频文件路径
        output_dir: 输出目录
        fps: 每秒提取的帧数（默认1帧/秒）
    Returns:
        提取的帧数
    """
    try:
        # 创建输出目录
        os.makedirs(output_dir, exist_ok=True)
        
        # 打开视频
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise Exception(f"无法打开视频文件 {video_path}")
        
        # 获取视频信息
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        video_fps = cap.get(cv2.CAP_PROP_FPS)
        duration = total_frames / video_fps if video_fps > 0 else 0
        
        # 计算提取间隔
        if video_fps == 0:
            video_fps = 30  # 默认帧率

        extract_interval = int(video_fps / fps)
        if extract_interval == 0:
            extract_interval = 1
        
        frame_count = 0
        extracted_count = 0
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            # 按间隔提取帧
            if frame_count % extract_interval == 0:
                frame_filename = f"frame_{extracted_count:06d}.jpg"
                frame_path = os.path.join(output_dir, frame_filename)
                cv2.imwrite(frame_path, frame)
                extracted_count += 1
            
            frame_count += 1
        
        cap.release()
        return extracted_count
        
    except Exception as e:
        raise Exception(f"提取帧时出错: {str(e)}")

def detect_frames(frames_dir, model):
    """
    检测所有帧中的路面灾害
    Args:
        frames_dir: 帧图片目录
        model: YOLO模型
    Returns:
        检测结果列表
    """
    try:
        # 获取所有帧文件
        frame_files = [f for f in os.listdir(frames_dir) if f.endswith(('.jpg', '.jpeg', '.png'))]
        frame_files.sort()
        
        results = []
        for i, frame_file in enumerate(frame_files):
            frame_path = os.path.join(frames_dir, frame_file)
            # 读取图片
            img = cv2.imread(frame_path)
            # 运行检测
            detection_results = model.predict(
                source=frame_path,
                save=False,  # 不保存图片
                conf=0.25,  # 置信度阈值
                iou=0.45,   # NMS IoU阈值
            )
            if detection_results and len(detection_results) > 0:
                result = detection_results[0]
                if result.boxes is not None and len(result.boxes) > 0:
                    class_counts = {}
                    detections = []
                    for idx, box in enumerate(result.boxes):
                        cls_id = int(box.cls.item())
                        conf = float(box.conf.item())
                        xyxy = box.xyxy[0].tolist()  # [x1, y1, x2, y2]
                        class_name = CLASS_NAMES.get(cls_id, f"未知类别({cls_id})")
                        x1, y1, x2, y2 = xyxy
                        box_w = x2 - x1
                        box_h = y2 - y1
                        real_w = box_w * GSD
                        real_h = box_h * GSD
                        if class_name in ["纵向裂缝", "横向裂缝", "斜向裂缝"]:
                            real_length = max(real_w, real_h)
                            area_or_length = {"length_m": real_length}
                        else:
                            real_area = real_w * real_h
                            area_or_length = {"area_m2": real_area}
                        detection_number = idx + 1
                        detections.append({
                            "number": detection_number,
                            "class_id": cls_id,
                            "class_name": class_name,
                            "class_name_en": CLASS_NAMES_EN.get(cls_id, f"Unknown({cls_id})"),
                            "confidence": conf,
                            "bbox": xyxy,
                            **area_or_length
                        })
                        if class_name not in class_counts:
                            class_counts[class_name] = 0
                        class_counts[class_name] += 1
                        # 画框和类别+编号
                        x1i, y1i, x2i, y2i = map(int, xyxy)
                        cv2.rectangle(img, (x1i, y1i), (x2i, y2i), (0,0,255), 2)
                        label = f"{CLASS_NAMES_EN.get(cls_id, f'Unknown({cls_id})')} #{detection_number}"
                        cv2.putText(img, label, (x1i, y1i+16), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,0,255), 2)
                    # 转base64
                    _, buffer = cv2.imencode('.jpg', img)
                    img_base64 = "data:image/jpeg;base64," + base64.b64encode(buffer).decode()
                    results.append({
                        'frame_file': img_base64,
                        'frame_index': i,
                        'class_counts': class_counts,
                        'total_detections': len(result.boxes),
                        'detections': detections
                    })
        return results
    except Exception as e:
        raise Exception(f"检测过程中出错: {str(e)}")

@router.post("/predict-video")
def predict_video(file: UploadFile = File(...), fps: int = Form(1)):
    """
    接收一个视频文件，提取帧并进行路面灾害检测
    """
    try:
        if not os.path.exists(MODEL_PATH):
            raise HTTPException(status_code=500, detail=f"模型文件未找到: {MODEL_PATH}")
        
        # 检查文件类型
        if not file.content_type or not file.content_type.startswith('video/'):
            raise HTTPException(status_code=400, detail="请上传视频文件")
        
        # 创建临时目录
        with tempfile.TemporaryDirectory() as tmpdir:
            # 保存上传的视频
            video_path = os.path.join(tmpdir, file.filename or "input_video.mp4")
            with open(video_path, "wb") as f:
                f.write(file.file.read())
            
            # 创建帧提取目录
            frames_dir = os.path.join(tmpdir, "frames")
            
            # 提取帧
            extracted_count = extract_frames(video_path, frames_dir, fps)
            if extracted_count == 0:
                raise HTTPException(status_code=500, detail="视频帧提取失败")
            
            # 加载模型
            model = YOLO(MODEL_PATH)
            
            # 检测帧
            detection_results = detect_frames(frames_dir, model)
            
            # 统计总体情况
            total_frames = extracted_count
            frames_with_defects = len(detection_results)
            total_detections = sum(r['total_detections'] for r in detection_results)
            
            # 统计各类别总数
            all_class_counts = {}
            for result in detection_results:
                for class_name, count in result['class_counts'].items():
                    if class_name not in all_class_counts:
                        all_class_counts[class_name] = 0
                    all_class_counts[class_name] += count
            
            # === 只存结构化病害对象 ===
            db_detection_results = []
            for frame in detection_results:
                for det in frame.get('detections', []):
                    class_name = det.get("class_name", "")
                    if class_name in ["纵向裂缝", "横向裂缝", "斜向裂缝"]:
                        length_m = det.get("length_m", 0)
                        area_m2 = 0
                    else:
                        length_m = 0
                        area_m2 = det.get("area_m2", 0)
                    db_item = {
                        "disease_type": class_name,
                        "bbox": det["bbox"],
                        "length_m": length_m,
                        "area_m2": area_m2
                    }
                    db_detection_results.append(db_item)
            with open(video_path, "rb") as f:
                file_data = f.read()
            import base64
            file_data_base64 = base64.b64encode(file_data).decode("utf-8")
            file_type = os.path.splitext(video_path)[-1].lower().replace('.', '')
            # 只有检测到病害时才插入告警
            if db_detection_results:
                with Session(engine) as session:
                    detection = RoadSurfaceDetection(
                        file_data=file_data_base64,
                        file_type=file_type,
                        disease_info=db_detection_results,  # 只存 disease_type/area/bbox
                        alarm_status=False,
                        detection_time=get_beijing_time()
                    )
                    session.add(detection)
                    session.commit()
            
            return {
                "video_info": {
                    "total_frames": total_frames,
                    "frames_with_defects": frames_with_defects,
                    "total_detections": total_detections,
                    "extraction_fps": fps
                },
                "class_statistics": all_class_counts,
                "frame_results": detection_results
            }
            
    except Exception as e:
        print("视频检测异常:", str(e))
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "traceback": traceback.format_exc()}
        ) 