from fastapi import APIRouter, Query
from datetime import datetime, timedelta
from sqlmodel import Session, select
from app.core.db import engine
from app.models import TaxiOrder, GPSRecord
from typing import Literal
import csv
from fastapi.responses import JSONResponse
from sqlalchemy import text

def parse_utc_timestamp(utc_str: str) -> datetime:
    return datetime.strptime(utc_str, "%Y%m%d%H%M%S")

router = APIRouter(prefix="/analysis", tags=["analysis-statistics"])

@router.get("/passenger-count-distribution")
def passenger_count_distribution(
    interval: Literal["15min", "1h"] = Query("15min", description="统计间隔，可选15min或1h"),
    date: str = Query(None, description="指定日期，格式为YYYYMMDD")
):
    """
    用SQL分桶统计每个时间段的订单数（乘客数），大幅提升查询速度。
    """
    if interval == "15min":
        bucket_sql = (
            "SUBSTRING(onutc, 1, 8) || SUBSTRING(onutc, 9, 2) || "
            "LPAD((FLOOR(CAST(SUBSTRING(onutc, 11, 2) AS INTEGER) / 15) * 15)::text, 2, '0') || '00'"
        )
        delta = timedelta(minutes=15)
    else:
        bucket_sql = "SUBSTRING(onutc, 1, 8) || SUBSTRING(onutc, 9, 2) || '0000'"
        delta = timedelta(hours=1)
    where_clause = "WHERE onutc IS NOT NULL"
    params = {}
    if date:
        where_clause += " AND SUBSTRING(onutc, 1, 8) = :date"
        params["date"] = date
    sql = text(f"""
        SELECT {bucket_sql} AS interval_start, COUNT(*) AS count
        FROM taxiorder
        {where_clause}
        GROUP BY interval_start
        ORDER BY interval_start
    """)
    result = []
    try:
        with Session(engine) as session:
            rows = session.execute(sql, params).fetchall()
            for row in rows:
                k = row[0]
                start_dt = parse_utc_timestamp(k)
                end_dt = start_dt + delta
                result.append({
                    "interval_start": k,
                    "interval_end": end_dt.strftime("%Y%m%d%H%M%S"),
                    "count": row[1]
                })
        return result
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"统计乘客数量分布失败: {str(e)}"})

@router.get("/distance-distribution")
def distance_distribution():
    """
    查询 TaxiOrder 表中不同距离运输的占比统计
    短途：< 4000米
    中途：4000-8000米
    长途：> 8000米
    """
    try:
        with Session(engine) as session:
            # 直接用 SQL 聚合统计
            sql = text(
                "SELECT "
                "COUNT(*) AS total, "
                "SUM(CASE WHEN distance < 4000 THEN 1 ELSE 0 END) AS short_count, "
                "SUM(CASE WHEN distance >= 4000 AND distance <= 8000 THEN 1 ELSE 0 END) AS medium_count, "
                "SUM(CASE WHEN distance > 8000 THEN 1 ELSE 0 END) AS long_count "
                "FROM taxiorder "
                "WHERE distance IS NOT NULL"
            )
            result = session.exec(sql).first()
            if result:
                total_count = result[0]
                short_distance_count = result[1]
                medium_distance_count = result[2]
                long_distance_count = result[3]
                if total_count > 0:
                    short_percentage = round((short_distance_count / total_count) * 100, 2)
                    medium_percentage = round((medium_distance_count / total_count) * 100, 2)
                    long_percentage = round((long_distance_count / total_count) * 100, 2)
                else:
                    short_percentage = medium_percentage = long_percentage = 0
                return {
                    "total_orders": total_count,
                    "distance_distribution": {
                        "short_distance": {
                            "range": "< 4000米",
                            "count": short_distance_count,
                            "percentage": short_percentage
                        },
                        "medium_distance": {
                            "range": "4000-8000米",
                            "count": medium_distance_count,
                            "percentage": medium_percentage
                        },
                        "long_distance": {
                            "range": "> 8000米",
                            "count": long_distance_count,
                            "percentage": long_percentage
                        }
                    }
                }
            else:
                return {
                    "total_orders": 0,
                    "distance_distribution": {
                        "short_distance": {"range": "< 4000米", "count": 0, "percentage": 0},
                        "medium_distance": {"range": "4000-8000米", "count": 0, "percentage": 0},
                        "long_distance": {"range": "> 8000米", "count": 0, "percentage": 0}
                    }
                }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"查询距离分布失败: {str(e)}"}
        )

@router.get("/occupied-taxi-count-distribution")
def occupied_taxi_count_distribution(
    interval: Literal["15min", "1h"] = Query("15min", description="统计间隔，可选15min或1h"),
    date: str = Query(None, description="指定日期，格式为YYYYMMDD")
):
    """
    用SQL分桶统计每个时间段内有多少不同的出租车在载客。
    """
    if interval == "15min":
        bucket_sql = (
            "SUBSTRING(onutc, 1, 8) || SUBSTRING(onutc, 9, 2) || "
            "LPAD((FLOOR(CAST(SUBSTRING(onutc, 11, 2) AS INTEGER) / 15) * 15)::text, 2, '0') || '00'"
        )
        delta = timedelta(minutes=15)
    else:
        bucket_sql = "SUBSTRING(onutc, 1, 8) || SUBSTRING(onutc, 9, 2) || '0000'"
        delta = timedelta(hours=1)
    where_clause = "WHERE onutc IS NOT NULL AND commaddr IS NOT NULL"
    params = {}
    if date:
        where_clause += " AND SUBSTRING(onutc, 1, 8) = :date"
        params["date"] = date
    sql = text(f"""
        SELECT {bucket_sql} AS interval_start, COUNT(DISTINCT commaddr) AS occupied_taxi_count
        FROM taxiorder
        {where_clause}
        GROUP BY interval_start
        ORDER BY interval_start
    """)
    result = []
    try:
        with Session(engine) as session:
            rows = session.execute(sql, params).fetchall()
            for row in rows:
                k = row[0]
                start_dt = parse_utc_timestamp(k)
                end_dt = start_dt + delta
                result.append({
                    "interval_start": k,
                    "interval_end": end_dt.strftime("%Y%m%d%H%M%S"),
                    "occupied_taxi_count": row[1]
                })
        return result
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"统计载客出租车数量分布失败: {str(e)}"})

@router.post("/import-gps-data")
def import_gps_data():
    filepath = "/app/data/csv/converted_jn0912.csv"
    batch_size = 1000
    total = 0
    max_rows = 3000
    try:
        with Session(engine) as session:
            with open(filepath, encoding="utf-8") as f:
                reader = csv.DictReader(f)
                batch = []
                for row in reader:
                    if total >= max_rows:
                        break
                    record = GPSRecord(
                        commaddr=row["COMMADDR"],
                        utc=row["UTC"],
                        lat=float(row["LAT"]),
                        lon=float(row["LON"]),
                        head=float(row["HEAD"]),
                        speed=float(row["SPEED"]),
                        tflag=int(row["TFLAG"]),
                    )
                    batch.append(record)
                    if len(batch) >= batch_size:
                        session.add_all(batch)
                        session.commit()
                        total += len(batch)
                        batch.clear()
                if batch and total < max_rows:
                    remain = min(len(batch), max_rows - total)
                    session.add_all(batch[:remain])
                    session.commit()
                    total += remain
        return {"message": f"成功导入{total}条GPS数据"}
    except Exception as e:
        return {"error": str(e)} 

@router.post("/import-taxi-orders")
def import_taxi_orders():
    filepath = "/app/data/csv/pair_converted_jn0912.csv"
    batch_size = 1000
    total = 0
    try:
        with Session(engine) as session:
            with open(filepath, encoding="utf-8") as f:
                reader = csv.DictReader(f)
                batch = []
                for row in reader:
                    commaddr = row.get("COMMADDR", "")
                    onutc = row.get("ONUTC", "")
                    onlat = row.get("ONLAT", "")
                    onlon = row.get("ONLON", "")
                    offutc = row.get("OFFUTC", "")
                    offlat = row.get("OFFLAT", "")
                    offlon = row.get("OFFLON", "")
                    if not all([commaddr, onutc, onlat, onlon, offutc, offlat, offlon]):
                        continue
                    try:
                        onlat_float = float(onlat)
                        onlon_float = float(onlon)
                        offlat_float = float(offlat)
                        offlon_float = float(offlon)
                        record = TaxiOrder(
                            commaddr=commaddr,
                            onutc=onutc,
                            onlat=onlat_float,
                            onlon=onlon_float,
                            offutc=offutc,
                            offlat=offlat_float,
                            offlon=offlon_float
                        )
                        batch.append(record)
                        if len(batch) >= batch_size:
                            session.add_all(batch)
                            session.commit()
                            total += len(batch)
                            batch.clear()
                    except (ValueError, TypeError) as e:
                        print(f"跳过无效数据行: {e}")
                        continue
                if batch:
                    session.add_all(batch)
                    session.commit()
                    total += len(batch)
        return {
            "message": f"成功导入{total}条出租车订单数据",
            "imported_count": total
        }
    except FileNotFoundError:
        return JSONResponse(
            status_code=404,
            content={"error": f"文件 {filepath} 不存在"}
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"导入失败: {str(e)}"}
        ) 