from fastapi import APIRouter, Query
from datetime import datetime
from sqlmodel import Session, select
from app.core.db import engine
from app.models import GPSRecord
from typing import List, Tuple
import math

def parse_utc_timestamp(utc_str: str) -> datetime:
    return datetime.strptime(utc_str, "%Y%m%d%H%M%S")

def coordinate_transform(lat: float, lon: float, from_system: str = "WGS84", to_system: str = "BD09") -> Tuple[float, float]:
    if from_system == to_system:
        return lat, lon
    def wgs84_to_gcj02(lat: float, lon: float) -> Tuple[float, float]:
        a = 6378245.0
        ee = 0.00669342162296594323
        def transform_lat(x: float, y: float) -> float:
            ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * math.sqrt(abs(x))
            ret += (20.0 * math.sin(6.0 * x * math.pi) + 20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
            ret += (20.0 * math.sin(y * math.pi) + 40.0 * math.sin(y / 3.0 * math.pi)) * 2.0 / 3.0
            ret += (160.0 * math.sin(y / 12.0 * math.pi) + 320 * math.sin(y * math.pi / 30.0)) * 2.0 / 3.0
            return ret
        def transform_lon(x: float, y: float) -> float:
            ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * math.sqrt(abs(x))
            ret += (20.0 * math.sin(6.0 * x * math.pi) + 20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
            ret += (20.0 * math.sin(x * math.pi) + 40.0 * math.sin(x / 3.0 * math.pi)) * 2.0 / 3.0
            ret += (150.0 * math.sin(x / 12.0 * math.pi) + 300.0 * math.sin(x / 30.0 * math.pi)) * 2.0 / 3.0
            return ret
        dlat = transform_lat(lon - 105.0, lat - 35.0)
        dlon = transform_lon(lon - 105.0, lat - 35.0)
        radlat = lat / 180.0 * math.pi
        magic = math.sin(radlat)
        magic = 1 - ee * magic * magic
        sqrtmagic = math.sqrt(magic)
        dlat = (dlat * 180.0) / ((a * (1 - ee)) / (magic * sqrtmagic) * math.pi)
        dlon = (dlon * 180.0) / (a / sqrtmagic * math.cos(radlat) * math.pi)
        mglat = lat + dlat
        mglon = lon + dlon
        return mglat, mglon
    def gcj02_to_bd09(lat: float, lon: float) -> Tuple[float, float]:
        z = math.sqrt(lon * lon + lat * lat) + 0.00002 * math.sin(lat * math.pi)
        theta = math.atan2(lat, lon) + 0.000003 * math.cos(lon * math.pi)
        bd_lon = z * math.cos(theta) + 0.0065
        bd_lat = z * math.sin(theta) + 0.006
        return bd_lat, bd_lon
    def wgs84_to_bd09(lat: float, lon: float) -> Tuple[float, float]:
        gcj_lat, gcj_lon = wgs84_to_gcj02(lat, lon)
        return gcj02_to_bd09(gcj_lat, gcj_lon)
    if from_system == "WGS84" and to_system == "BD09":
        return wgs84_to_bd09(lat, lon)
    elif from_system == "WGS84" and to_system == "GCJ02":
        return wgs84_to_gcj02(lat, lon)
    elif from_system == "GCJ02" and to_system == "BD09":
        return gcj02_to_bd09(lat, lon)
    else:
        return lat, lon

def filter_gps_noise(points: List[dict], max_speed: float = 50.0, max_acceleration: float = 10.0) -> List[dict]:
    if len(points) < 2:
        return points
    filtered_points = [points[0]]
    for i in range(1, len(points)):
        current = points[i]
        previous = points[i-1]
        try:
            current_time = datetime.strptime(current['utc'], "%Y%m%d%H%M%S")
            previous_time = datetime.strptime(previous['utc'], "%Y%m%d%H%M%S")
            time_diff = (current_time - previous_time).total_seconds()
        except:
            time_diff = 1.0
        if time_diff <= 0:
            continue
        lat1, lon1 = previous['lat'], previous['lon']
        lat2, lon2 = current['lat'], current['lon']
        R = 6371000
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        distance = R * c
        actual_speed = distance / time_diff if time_diff > 0 else 0
        speed_kmh = actual_speed * 3.6
        if speed_kmh > max_speed:
            print(f"过滤异常速度点: {speed_kmh:.1f} km/h")
            continue
        if len(filtered_points) > 1:
            prev_speed = float(previous.get('speed', 0)) / 100
            acceleration = abs(actual_speed - prev_speed) / time_diff if time_diff > 0 else 0
            if acceleration > max_acceleration:
                print(f"过滤异常加速度点: {acceleration:.1f} m/s²")
                continue
        filtered_points.append(current)
    return filtered_points

def smooth_trajectory(points: List[dict], window_size: int = 3) -> List[dict]:
    if len(points) < window_size:
        return points
    smoothed_points = []
    for i in range(len(points)):
        start_idx = max(0, i - window_size // 2)
        end_idx = min(len(points), i + window_size // 2 + 1)
        window_lats = [points[j]['lat'] for j in range(start_idx, end_idx)]
        window_lons = [points[j]['lon'] for j in range(start_idx, end_idx)]
        avg_lat = sum(window_lats) / len(window_lats)
        avg_lon = sum(window_lons) / len(window_lons)
        smoothed_point = points[i].copy()
        smoothed_point['lat'] = avg_lat
        smoothed_point['lon'] = avg_lon
        smoothed_points.append(smoothed_point)
    return smoothed_points

router = APIRouter(prefix="/analysis", tags=["analysis-trajectory"])

@router.get("/gps-records")
def get_gps_records(
    commaddr: str = Query(..., description="车牌号"),
    start_utc: str = Query(..., description="起始时间戳，格式YYYYMMDDHHMMSS"),
    end_utc: str = Query(..., description="结束时间戳，格式YYYYMMDDHHMMSS")
):
    try:
        with Session(engine) as session:
            query = select(GPSRecord).where(
                GPSRecord.commaddr == commaddr,
                GPSRecord.utc >= start_utc,
                GPSRecord.utc <= end_utc
            )
            records = session.exec(query).all()
            result = []
            for record in records:
                result.append({
                    "id": record.id,
                    "commaddr": record.commaddr,
                    "utc": record.utc,
                    "lat": record.lat,
                    "lon": record.lon,
                    "head": record.head,
                    "speed": record.speed,
                    "tflag": record.tflag
                })
            return {
                "commaddr": commaddr,
                "start_utc": start_utc,
                "end_utc": end_utc,
                "count": len(result),
                "records": result
            }
    except Exception as e:
        return {"error": str(e)} 

@router.get("/gps-records-corrected")
def get_gps_records_corrected(
    commaddr: str = Query(..., description="车牌号"),
    start_utc: str = Query(..., description="起始时间戳，格式YYYYMMDDHHMMSS"),
    end_utc: str = Query(..., description="结束时间戳，格式YYYYMMDDHHMMSS"),
    coordinate_system: str = Query("BD09", description="目标坐标系：WGS84, GCJ02, BD09")
):
    try:
        with Session(engine) as session:
            query = select(GPSRecord).where(
                GPSRecord.commaddr == commaddr,
                GPSRecord.utc >= start_utc,
                GPSRecord.utc <= end_utc
            ).order_by(GPSRecord.utc)
            records = session.exec(query).all()
            if not records:
                return {
                    "commaddr": commaddr,
                    "start_utc": start_utc,
                    "end_utc": end_utc,
                    "count": 0,
                    "records": [],
                    "correction_info": {
                        "original_count": 0,
                        "coordinate_system": coordinate_system
                    }
                }
            corrected_points = []
            for record in records:
                point = {
                    "id": record.id,
                    "commaddr": record.commaddr,
                    "utc": record.utc,
                    "lat": record.lat,
                    "lon": record.lon,
                    "head": record.head,
                    "speed": record.speed,
                    "tflag": record.tflag
                }
                if coordinate_system != "WGS84":
                    point['lat'], point['lon'] = coordinate_transform(
                        point['lat'], point['lon'], 
                        from_system="WGS84", 
                        to_system=coordinate_system
                    )
                corrected_points.append(point)
            return {
                "commaddr": commaddr,
                "start_utc": start_utc,
                "end_utc": end_utc,
                "count": len(corrected_points),
                "records": corrected_points,
                "correction_info": {
                    "original_count": len(records),
                    "coordinate_system": coordinate_system
                }
            }
    except Exception as e:
        return {"error": str(e)} 