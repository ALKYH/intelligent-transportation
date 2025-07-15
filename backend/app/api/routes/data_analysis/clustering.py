from fastapi import APIRouter, Query
import numpy as np
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import StandardScaler
from fastapi.responses import JSONResponse
from datetime import datetime, timedelta
from sqlmodel import Session, select
from app.core.db import engine
from app.models import TaxiOrder

def parse_utc_timestamp(utc_str: str) -> datetime:
    return datetime.strptime(utc_str, "%Y%m%d%H%M%S")

def get_time_range_data(start_utc: str, minutes: int = 15) -> list:
    start_time = parse_utc_timestamp(start_utc)
    end_time = start_time + timedelta(minutes=minutes)
    start_utc_str = start_time.strftime("%Y%m%d%H%M%S")
    end_utc_str = end_time.strftime("%Y%m%d%H%M%S")
    results = []
    with Session(engine) as session:
        query = select(TaxiOrder).where(
            TaxiOrder.onutc >= start_utc_str,
            TaxiOrder.onutc <= end_utc_str
        )
        records = session.exec(query).all()
        for row in records:
            results.append({
                "lat": row.onlat,
                "lng": row.onlon,
                "utc": row.onutc
            })
    return results

router = APIRouter(prefix="/analysis", tags=["analysis-clustering"])

@router.get("/dbscan-clustering")
def dbscan_clustering(
    start_utc: str = Query(..., description="起始时间戳，如20130912011417"),
    eps: float = Query(0.01, description="DBSCAN的eps参数，控制聚类半径"),
    min_samples: int = Query(3, description="DBSCAN的min_samples参数，最小样本数")
):
    """
    使用DBSCAN算法对上车点进行聚类分析，提取热门上客点
    """
    try:
        data = get_time_range_data(start_utc, 15)
        if not data:
            return JSONResponse(
                status_code=404, 
                content={"error": f"在时间戳 {start_utc} 后15分钟内没有找到数据"}
            )
        coordinates = np.array([[point["lat"], point["lng"]] for point in data])
        if len(coordinates) < min_samples:
            return JSONResponse(
                status_code=400,
                content={"error": f"数据点数量({len(coordinates)})少于最小样本数({min_samples})"}
            )
        scaler = StandardScaler()
        coordinates_scaled = scaler.fit_transform(coordinates)
        dbscan = DBSCAN(eps=eps, min_samples=min_samples)
        cluster_labels = dbscan.fit_predict(coordinates_scaled)
        unique_labels = set(cluster_labels)
        hot_spots = []
        for label in unique_labels:
            if label == -1:
                continue
            cluster_points = coordinates[cluster_labels == label]
            center_lat = np.mean(cluster_points[:, 0])
            center_lng = np.mean(cluster_points[:, 1])
            count = len(cluster_points)
            if count >= min_samples:
                hot_spots.append({
                    "lng": float(center_lng),
                    "lat": float(center_lat),
                    "count": count
                })
        hot_spots.sort(key=lambda x: x["count"], reverse=True)
        return {
            "start_utc": start_utc,
            "total_points": len(data),
            "hot_spots_found": len(hot_spots),
            "noise_points": int(np.sum(cluster_labels == -1)),
            "parameters": {
                "eps": eps,
                "min_samples": min_samples
            },
            "hot_spots": hot_spots
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"聚类分析失败: {str(e)}"}
        ) 