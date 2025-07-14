from fastapi import APIRouter, UploadFile, File, HTTPException
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
                    # 统计检测结果
                    class_counts = {}
                    detections = []
                    
                    for box in result.boxes:
                        cls_id = int(box.cls.item())
                        conf = float(box.conf.item())
                        xyxy = box.xyxy[0].tolist()  # [x1, y1, x2, y2]
                        area = (xyxy[2] - xyxy[0]) * (xyxy[3] - xyxy[1])
                        
                        class_name = CLASS_NAMES.get(cls_id, f"未知类别({cls_id})")
                        
                        if class_name not in class_counts:
                            class_counts[class_name] = 0
                        class_counts[class_name] += 1
                        
                        detections.append({
                            "class_id": cls_id,
                            "class_name": class_name,
                            "confidence": conf,
                            "bbox": xyxy,
                            "area": area
                        })
                    
                    # 记录有检测结果的帧
                    results.append({
                        'frame_file': frame_file,
                        'frame_index': i,
                        'class_counts': class_counts,
                        'total_detections': len(result.boxes),
                        'detections': detections
                    })
        
        return results
        
    except Exception as e:
        raise Exception(f"检测过程中出错: {str(e)}")

@router.post("/predict-video")
def predict_video(file: UploadFile = File(...), fps: int = 1):
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