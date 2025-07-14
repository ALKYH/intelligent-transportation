#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
视频路面灾害检测
功能：上传视频 -> 分割成图片 -> 检测路面灾害 -> 显示结果
"""

import os
import sys
import cv2
import numpy as np
from pathlib import Path
import shutil
from datetime import datetime

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
            print(f"错误: 无法打开视频文件 {video_path}")
            return 0
        
        # 获取视频信息
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        video_fps = cap.get(cv2.CAP_PROP_FPS)
        duration = total_frames / video_fps
        
        print(f"视频信息:")
        print(f"  - 总帧数: {total_frames}")
        print(f"  - 视频FPS: {video_fps:.2f}")
        print(f"  - 时长: {duration:.2f} 秒")
        print(f"  - 提取频率: {fps} 帧/秒")
        
        # 计算提取间隔
        video_fps = cap.get(cv2.CAP_PROP_FPS)
        if video_fps == 0:
            print("警告: 视频FPS为0，自动设置为30")
            video_fps = 30  # 或者你可以手动设置为实际帧率

        extract_interval = int(video_fps / fps)
        if extract_interval == 0:
            extract_interval = 1
        print(f"  - 提取间隔: 每 {extract_interval} 帧提取一次")
        
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
                
                if extracted_count % 10 == 0:
                    print(f"已提取 {extracted_count} 帧...")
            
            frame_count += 1
        
        cap.release()
        print(f"提取完成! 共提取 {extracted_count} 帧")
        return extracted_count
        
    except Exception as e:
        print(f"提取帧时出错: {str(e)}")
        return 0

def detect_frames(frames_dir, model_name="train4_finetune"):
    """
    检测所有帧中的路面灾害
    Args:
        frames_dir: 帧图片目录
        model_name: 模型名称
    Returns:
        检测结果列表
    """
    try:
        from ultralytics import YOLO
        
        # 模型路径映射
        model_paths = {
            "train4": "runs/train4/weights/best.pt",
            "train4_finetune": "runs/train4_finetune/weights/last.pt",
            "train2_finetune3": "runs/train2_finetune3/weights/best.pt",
            "train32": "runs/train32/weights/best.pt"
        }
        
        model_path = model_paths.get(model_name)
        if model_path is None:
            print(f"错误: 未知的模型名称: {model_name}")
            print("可用的模型:")
            for name in model_paths.keys():
                print(f"  - {name}")
            return []
        
        if not os.path.exists(model_path):
            print(f"错误: 模型文件不存在: {model_path}")
            return []
        
        print(f"加载模型: {model_path}")
        model = YOLO(model_path)
        
        # 类别名称映射
        class_names = {
            0: "纵向裂缝",
            1: "横向裂缝", 
            2: "龟裂",
            3: "斜向裂缝",
            4: "修补",
            5: "坑洞"
        }
        
        # 获取所有帧文件
        frame_files = [f for f in os.listdir(frames_dir) if f.endswith(('.jpg', '.jpeg', '.png'))]
        frame_files.sort()
        
        print(f"开始检测 {len(frame_files)} 帧...")
        
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
                    for box in result.boxes:
                        cls_id = int(box.cls.item())
                        class_name = class_names.get(cls_id, f"未知类别({cls_id})")
                        
                        if class_name not in class_counts:
                            class_counts[class_name] = 0
                        class_counts[class_name] += 1
                    
                    # 记录有检测结果的帧
                    results.append({
                        'frame_file': frame_file,
                        'frame_path': frame_path,
                        'class_counts': class_counts,
                        'total_detections': len(result.boxes)
                    })
                    
                    print(f"帧 {i+1}/{len(frame_files)}: {frame_file} - 检测到 {len(result.boxes)} 个目标")
                else:
                    print(f"帧 {i+1}/{len(frame_files)}: {frame_file} - 无检测结果")
            else:
                print(f"帧 {i+1}/{len(frame_files)}: {frame_file} - 检测失败")
        
        print(f"检测完成! 发现 {len(results)} 帧包含路面灾害")
        return results
        
    except Exception as e:
        print(f"检测过程中出错: {str(e)}")
        import traceback
        traceback.print_exc()
        return []

def save_detection_results(results, output_dir):
    """
    保存检测结果
    Args:
        results: 检测结果列表
        output_dir: 输出目录
    """
    try:
        # 创建结果目录
        results_dir = os.path.join(output_dir, "detection_results")
        os.makedirs(results_dir, exist_ok=True)
        
        # 保存检测到的帧
        # 类别名称映射
        class_names = {
            0: "纵向裂缝",
            1: "横向裂缝", 
            2: "龟裂",
            3: "斜向裂缝",
            4: "修补",
            5: "坑洞"
        }
        for i, result in enumerate(results):
            src_path = result['frame_path']
            dst_filename = f"detected_{i+1:03d}_{result['frame_file']}"
            dst_path = os.path.join(results_dir, dst_filename)
            shutil.copy2(src_path, dst_path)

            # 读取原图
            img = cv2.imread(src_path)
            if img is None:
                print(f"警告: 无法读取图片 {src_path}，跳过标注。")
                continue
            # 重新检测，获取boxes
            from ultralytics import YOLO
            model_path = "runs/train4_finetune/weights/last.pt"
            model = YOLO(model_path)
            detection_results = model.predict(source=src_path, conf=0.25, iou=0.45)
            boxes_info = []
            if detection_results and len(detection_results) > 0:
                det = detection_results[0]
                if det.boxes is not None and len(det.boxes) > 0:
                    for box in det.boxes:
                        x1, y1, x2, y2 = map(int, box.xyxy[0])
                        cls_id = int(box.cls.item())
                        conf = box.conf.item()
                        area = (x2 - x1) * (y2 - y1)
                        # 画框
                        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
                        # 标注类别名和面积
                        class_name = class_names.get(cls_id, f"未知类别({cls_id})")
                        label = f"{class_name} 面积:{area}"
                        cv2.putText(img, label, (x1, max(y1-10, 0)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,255,0), 2)
                        boxes_info.append({
                            'cls_id': cls_id,
                            'conf': conf,
                            'area': area,
                            'box': [x1, y1, x2, y2]
                        })
            # 保存带标注的图片
            annotated_img_path = os.path.join(results_dir, f"annotated_{i+1:03d}_{result['frame_file']}")
            cv2.imwrite(annotated_img_path, img)
            # 保存面积等信息到txt
            txt_path = os.path.splitext(annotated_img_path)[0] + '.txt'
            with open(txt_path, 'w', encoding='utf-8') as f:
                for box in boxes_info:
                    class_name = class_names.get(box['cls_id'], f"未知类别({box['cls_id']})")
                    f.write(f"类别: {class_name}, 置信度: {box['conf']:.2f}, 面积: {box['area']}, 框: {box['box']}\n")
        
        # 删除临时目录
        temp_dir = os.path.join(results_dir, "annotated")
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
        
        # 生成结果报告
        report_path = os.path.join(output_dir, "detection_report.txt")
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write("视频路面灾害检测报告\n")
            f.write("=" * 50 + "\n")
            f.write(f"检测时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"检测到路面灾害的帧数: {len(results)}\n\n")
            
            for i, result in enumerate(results):
                f.write(f"帧 {i+1}: {result['frame_file']}\n")
                f.write(f"  总检测数: {result['total_detections']}\n")
                f.write("  检测详情:\n")
                for class_name, count in result['class_counts'].items():
                    f.write(f"    - {class_name}: {count} 个\n")
                f.write("\n")
        
        print(f"结果已保存到: {results_dir}")
        print(f"报告已保存到: {report_path}")
        
    except Exception as e:
        print(f"保存结果时出错: {str(e)}")

def display_results(results, output_dir):
    """
    显示检测结果
    Args:
        results: 检测结果列表
        output_dir: 输出目录
    """
    if not results:
        print("未检测到任何路面灾害")
        return
    
    print("\n" + "=" * 60)
    print("检测结果汇总")
    print("=" * 60)
    
    # 统计总体情况
    total_frames = len(results)
    total_detections = sum(r['total_detections'] for r in results)
    
    # 统计各类别总数
    all_class_counts = {}
    for result in results:
        for class_name, count in result['class_counts'].items():
            if class_name not in all_class_counts:
                all_class_counts[class_name] = 0
            all_class_counts[class_name] += count
    
    print(f"检测到路面灾害的帧数: {total_frames}")
    print(f"总检测目标数: {total_detections}")
    print("\n各类别统计:")
    for class_name, count in all_class_counts.items():
        print(f"  - {class_name}: {count} 个")
    
    print("\n详细结果:")
    print("-" * 60)
    
    for i, result in enumerate(results):
        print(f"帧 {i+1}: {result['frame_file']}")
        print(f"  位置: {output_dir}/detection_results/detected_{i+1:03d}_{result['frame_file']}")
        print(f"  标注图: {output_dir}/detection_results/annotated_{i+1:03d}_{result['frame_file']}")
        print(f"  检测数: {result['total_detections']}")
        print("  灾害类型:")
        for class_name, count in result['class_counts'].items():
            print(f"    - {class_name}: {count} 个")
        print()

def main():
    """主函数"""
    if len(sys.argv) < 2:
        print("使用方法:")
        print("python video_detection.py <视频文件路径> [提取FPS] [模型名称]")
        print("\n示例:")
        print("python video_detection.py my_video.mp4")
        print("python video_detection.py my_video.mp4 2 train4_finetune")
        print("\n参数说明:")
        print("  - 视频文件路径: 要检测的视频文件")
        print("  - 提取FPS: 每秒提取的帧数 (默认1)")
        print("  - 模型名称: 使用的检测模型 (默认train4_finetune)")
        return
    
    video_path = sys.argv[1]
    fps = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    model_name = sys.argv[3] if len(sys.argv) > 3 else "train4_finetune"
    
    # 检查视频文件
    if not os.path.exists(video_path):
        print(f"错误: 视频文件不存在: {video_path}")
        return
    
    # 创建输出目录
    video_name = os.path.splitext(os.path.basename(video_path))[0]
    output_dir = f"video_detection_{video_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    frames_dir = os.path.join(output_dir, "frames")
    
    print(f"开始处理视频: {video_path}")
    print(f"输出目录: {output_dir}")
    print(f"提取FPS: {fps}")
    print(f"使用模型: {model_name}")
    print("-" * 50)
    
    # 步骤1: 提取帧
    print("步骤1: 提取视频帧...")
    extracted_count = extract_frames(video_path, frames_dir, fps)
    if extracted_count == 0:
        print("提取帧失败，退出")
        return
    
    # 步骤2: 检测路面灾害
    print("\n步骤2: 检测路面灾害...")
    results = detect_frames(frames_dir, model_name)
    
    # 步骤3: 保存结果
    print("\n步骤3: 保存检测结果...")
    save_detection_results(results, output_dir)
    
    # 步骤4: 显示结果
    print("\n步骤4: 显示检测结果...")
    display_results(results, output_dir)
    
    print(f"\n处理完成! 所有结果保存在: {output_dir}")

if __name__ == "__main__":
    main() 