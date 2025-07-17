from fastapi import APIRouter, Depends, HTTPException 
from sqlmodel import Session 
import base64
from app.Logger.Logger import Logger

# 初始化 Logger 实例，注意需传入正确的 aes_key.bin 路径
logger = Logger()

router = APIRouter(prefix="/logger", tags=["logger"])

# RoadSurfaceDetection API endpoints 
@router.post("/road-surface-detection", response_model=dict)
def create_road_detection(
    file_data: str, file_type: str, disease_info: str
):
    result = logger.create_road_surface_detection(file_data, file_type, disease_info)
    if result:
        return {"message": "Detection put successfully"}
    raise HTTPException(status_code=500, detail="创建记录失败")

@router.get("/road-surface-detection/{detection_id}", response_model=dict)
def read_road_detection(detection_id: int):
    result = logger.get_road_surface_detection(detection_id)
    print(result)
    if not result:
        raise HTTPException(status_code=404, detail="Detection not found")
    return result[0]

@router.get("/road-surface-detection", response_model=list)
def read_all_road_detections():
    results = logger.get_road_surface_detection()
    return results

@router.put("/road-surface-detection/{detection_id}", response_model=dict)
def update_road_detection(
    detection_id: int, file_data: str = None, file_type: str = None, disease_info: str = None, alarm_status: bool = None
):
    result = logger.update_road_surface_detection(detection_id, file_data, file_type, disease_info, alarm_status)
    if not result:
        raise HTTPException(status_code=404, detail="Detection not found")
    updated_record = logger.get_road_surface_detection(detection_id)
    return {"message": "Detection update successfully"}

@router.delete("/road-surface-detection/{detection_id}")
def delete_road_detection(detection_id: int):
    result = logger.delete_road_surface_detection(detection_id)
    if not result:
        raise HTTPException(status_code=404, detail="Detection not found")
    return {"message": "Detection deleted successfully"}

# MaliciousAttacks API endpoints
@router.post("/malicious-attack", response_model=dict)
def create_attack(
    attack_info: str, face_image: bytes
):
    result = logger.create_malicious_attack(attack_info, face_image)
    if result:
        return {"message": "Attack add successfully"}
    raise HTTPException(status_code=500, detail="创建记录失败")

@router.get("/malicious-attack/{attack_id}", response_model=list)
def read_attack(attack_id: int):
    result = logger.get_malicious_attacks(attack_id)
    if not result:
        raise HTTPException(status_code=404, detail="Attack not found")
    return result[0]

@router.get("/malicious-attack", response_model=list)
def read_all_attacks():
    results = logger.get_malicious_attacks()
    return results

@router.put("/malicious-attack/{attack_id}", response_model=dict)
def update_attack(
    attack_id: int, attack_info: str = None, face_image: bytes = None
):
    result = logger.update_malicious_attack(attack_id, attack_info, face_image)
    if not result:
        raise HTTPException(status_code=404, detail="Attack not found")
    updated_record = logger.get_malicious_attacks(attack_id)
    return {"message": "Attack update successfully"}

@router.delete("/malicious-attack/{attack_id}")
def delete_attack(attack_id: int):
    result = logger.delete_malicious_attack(attack_id)
    if not result:
        raise HTTPException(status_code=404, detail="Attack not found")
    return {"message": "Attack delete successfully"}