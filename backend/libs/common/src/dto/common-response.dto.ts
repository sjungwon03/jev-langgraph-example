export interface CommonResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}
