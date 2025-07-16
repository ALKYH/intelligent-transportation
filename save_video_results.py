#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
视频/图片路面病害检测与面积估算工具
支持：
- 视频检测与结果保存
- 图片目录批量检测与面积/长度估算
"""

import os
import cv2
import time
from datetime import datetime
from ultralytics import YOLO
import argparse
from PIL import Image

# 设定参考物实际长度和像素长度
PLATE_REAL_LENGTH = 0。45  # 35厘米
PLATE_PIXEL_LENGTH = 105   # 55像素
GSD = PLATE_REAL_LENGTH / PLATE_PIXEL_LENGTH  # 单位：米/像素
print(f"动态GSD: {GSD:.4f} 米/像素")

def save_video_detection_results(video_path, model_path, conf_threshold=0.25, output_dir=None):
    """
    保存视频检测结果
    Args:
        video_path: 视频文件路径
        model_path: 模型文件路径
        conf_threshold: 置信度阈值
        output_dir: 输出目录
    """
    if output_dir is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_dir = f"video_results_{timestamp}"
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(os.path.join(output_dir, "detection_results"), exist_ok=True)
    os.makedirs(os.path.join(output_dir, "frames"), exist_ok=True)
    print(f"加载模型: {model_path}")
    model = YOLO(model_path)
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"错误: 无法打开视频文件 {video_path}")
        return
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"视频信息: {width}x{height}, {fps:.1f} FPS, {frame_count} 帧")
    print(f"输出目录: {output_dir}")
    detection_stats = {
        'total_frames': 0,
        'detected_frames': 0,
        'total_detections': 0,
        'class_counts': {},
        'processing_times': []
    }
    frame_idx = 0
    processed_frames = 0
    print("\n开始处理视频...")
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame_idx += 1
        if frame_idx % 15 != 0:
            continue
        processed_frames += 1
        start_time = time.time()
        results = model(frame, conf=conf_threshold, verbose=False)
        processing_time = time.time() - start_time
        detection_stats['processing_times'].append(processing_time)
        detection_stats['total_frames'] += 1
        frame_filename = f"frame_{frame_idx:06d}.jpg"
        frame_path = os.path.join(output_dir, "frames", frame_filename)
        cv2.imwrite(frame_path, frame)
        detections_this_frame = 0
        frame_class_counts = {}
        for result in results:
            boxes = result.boxes
            if boxes is not None:
                for box in boxes:
                    cls = int(box.cls[0])
                    conf = float(box.conf[0])
                    class_name = model.names[cls]
                    detections_this_frame += 1
                    frame_class_counts[class_name] = frame_class_counts.get(class_name, 0) + 1
                    detection_stats['class_counts'][class_name] = detection_stats['class_counts'].get(class_name, 0) + 1
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)
                    box_w = x2 - x1
                    box_h = y2 - y1
                    real_w = box_w * GSD
                    real_h = box_h * GSD
                    real_area = real_w * real_h
                    if class_name.lower() in ["transverse crack", "longitudinal crack"]:
                        real_length = max(real_w, real_h)
                        label = f"{class_name} {real_length:.2f} m"
                    else:
                        label = f"{class_name} {real_area:.2f} m2"
                    cv2.putText(frame, label, (int(x1), int(y1) - 10),
                              cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
        if detections_this_frame > 0:
            detection_stats['detected_frames'] += 1
            detection_stats['total_detections'] += detections_this_frame
            detected_filename = f"detected_{processed_frames:03d}_frame_{frame_idx:06d}.jpg"
            detected_path = os.path.join(output_dir, "detection_results", detected_filename)
            cv2.imwrite(detected_path, frame)
            annotated_filename = f"annotated_{processed_frames:03d}_frame_{frame_idx:06d}.txt"
            annotated_path = os.path.join(output_dir, "detection_results", annotated_filename)
            with open(annotated_path, 'w', encoding='utf-8') as f:
                for result in results:
                    boxes = result.boxes
                    if boxes is not None:
                        for box in boxes:
                            cls = int(box.cls[0])
                            class_name = model.names[cls]
                            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                            box_w = x2 - x1
                            box_h = y2 - y1
                            real_w = box_w * GSD
                            real_h = box_h * GSD
                            real_area = real_w * real_h
                            f.write(f"{class_name} {real_area:.4f}\n")
            print(f"处理帧 {processed_frames}/{frame_count//5} ({frame_idx} 已处理)")
            print(f"  检测到 {detections_this_frame} 个目标")
            for class_name, count in frame_class_counts.items():
                print(f"    {class_name}: {count}")
            print()
        if processed_frames % 10 == 0:
            print(f"处理进度: {processed_frames}/{frame_count//5} 帧")
    cap.release()
    generate_detection_report(output_dir, detection_stats, model.names)
    print(f"\n=== 检测完成 ===")
    print(f"结果保存在: {output_dir}")
    print(f"处理帧数: {detection_stats['total_frames']}")
    print(f"检测到目标的帧数: {detection_stats['detected_frames']}")
    print(f"总检测数: {detection_stats['total_detections']}")
    if detection_stats['processing_times']:
        avg_time = sum(detection_stats['processing_times']) / len(detection_stats['processing_times'])
        fps = 1.0 / avg_time
        print(f"平均检测时间: {avg_time:.3f} 秒")
        print(f"推理速度: {fps:.1f} FPS")

def generate_detection_report(output_dir, stats, class_names):
    report_path = os.path.join(output_dir, "detection_report.txt")
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write("视频路面灾害检测报告\n")
        f.write("=" * 50 + "\n")
        f.write(f"检测时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"检测到路面灾害的帧数: {stats['detected_frames']}\n\n")
        f.write("检测类别统计:\n")
        for class_name, count in stats['class_counts'].items():
            f.write(f"  {class_name}: {count} 个\n")
        f.write(f"\n总检测数: {stats['total_detections']}\n")
        f.write(f"处理帧数: {stats['total_frames']}\n")
        if stats['processing_times']:
            avg_time = sum(stats['processing_times']) / len(stats['processing_times'])
            fps = 1.0 / avg_time
            f.write(f"平均检测时间: {avg_time:.3f} 秒\n")
            f.write(f"推理速度: {fps:.1f} FPS\n")

def estimate_image_dir_area(model_path, image_dir, conf_threshold=0.25, output_dir=None):
    """
    对图片目录下所有图片进行检测与面积/长度估算
    Args:
        model_path: 模型文件路径
        image_dir: 图片目录
        conf_threshold: 置信度阈值
        output_dir: 输出目录
    """
    if output_dir is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_dir = f"image_results_{timestamp}"
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(os.path.join(output_dir, "detection_results"), exist_ok=True)
    print(f"加载模型: {model_path}")
    model = YOLO(model_path)
    image_files = [f for f in os.listdir(image_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    print(f"共找到 {len(image_files)} 张图片")
    for idx, image_name in enumerate(image_files, 1):
        image_path = os.path.join(image_dir, image_name)
        img = cv2.imread(image_path)
        if img is None:
            print(f"无法读取图片: {image_name}")
            continue
        results = model(img, conf=conf_threshold, verbose=False)
        detections_this_image = 0
        for result in results:
            boxes = result.boxes
            if boxes is not None:
                for box in boxes:
                    cls = int(box.cls[0])
                    class_name = model.names[cls]
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    box_w = x2 - x1
                    box_h = y2 - y1
                    real_w = box_w * GSD
                    real_h = box_h * GSD
                    real_area = real_w * real_h
                    if class_name.lower() in ["transverse crack", "longitudinal crack"]:
                        real_length = max(real_w, real_h)
                        label = f"{class_name} {real_length:.2f} m"
                    else:
                        label = f"{class_name} {real_area:.2f} m2"
                    cv2.rectangle(img, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)
                    cv2.putText(img, label, (int(x1), int(y1) - 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
                    detections_this_image += 1
        out_img_path = os.path.join(output_dir, "detection_results", f"detected_{idx:03d}_{image_name}")
        cv2.imwrite(out_img_path, img)
        print(f"[{idx}/{len(image_files)}] {image_name} 检测到 {detections_this_image} 个目标，结果已保存。")
    print(f"\n=== 图片批量检测完成 ===")
    print(f"结果保存在: {output_dir}")

def main():
    parser = argparse.ArgumentParser(description="视频/图片路面病害检测与面积估算工具")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--video", help="视频文件路径")
    group.add_argument("--imagedir", help="图片目录路径")
    parser.add_argument("--model", default="runs/train4/weights/best.pt", help="模型文件路径")
    parser.add_argument("--conf", type=float, default=0.25, help="置信度阈值")
    parser.add_argument("--output", help="输出目录")
    args = parser.parse_args()
    print("视频/图片路面病害检测与面积估算工具")
    print("=" * 40)
    if args.video:
        save_video_detection_results(
            video_path=args.video,
            model_path=args.model,
            conf_threshold=args.conf,
            output_dir=args.output
        )
    elif args.imagedir:
        estimate_image_dir_area(
            model_path=args.model,
            image_dir=args.imagedir,
            conf_threshold=args.conf,
            output_dir=args.output
        )

if __name__ == "__main__":
    main() 