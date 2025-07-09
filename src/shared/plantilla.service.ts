import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class PlantillaService {
  private url = 'http://localhost:3001'; // URL del servidor

  constructor(private http: HttpClient) {}

  // Buscar y abrir la carpeta de la orden para poder visualizar las fotos
  buscarOrden(orden: string, destino: string | null): Observable<any> {
    console.log('Buscar orden - Orden: ', orden, ' Destino: ', destino);
    const body = { destino: destino }; // Siempre incluye destino en el cuerpo de la petición
    return this.http.post<any>(`${this.url}/buscar-of/${orden}`, body);
  }

  // Copiar y comprimir fotos desde la carpeta seleccionada
  copiarFotos(rutaSeleccionada: string): Observable<any> {
    console.log('Copiar fotos - Ruta seleccionada: ', rutaSeleccionada);
    const body = { rutaSeleccionada: rutaSeleccionada };
    return this.http.post<any>(`${this.url}/copiar-fotos`, body);
  }

  //BUSCAR Y ABRIR LA CARPETA DE LA ORDEN PARA PODER VISUALIZAR LAS FOTOS
  buscarOrdenCv(orden: string, destino: string | null): Observable<any> {
    console.log('Buscar orden - Orden: ', orden, ' Destino: ', destino);
    const body = { destino: destino }; // Siempre incluye destino en el cuerpo de la petición
    return this.http.post<any>(`${this.url}/buscar-orden-cv/${orden}`, body);
  }

  //BORRAR LO QUE HAY EN LA CARPETA TEMPORAL
  limpiarCarpetaTemporal(): Observable<any> {
    return this.http.post<any>(`${this.url}/limpiar-carpeta-temporal`, {});
  }

  //VISUALIZAR TODO LO QUE HAY EN LA CARPETA TEMPORAL :
  leerCarpetaTemporal(): Observable<any> {
    return this.http.get<any>(`${this.url}/leer-carpeta-temporal`);
  }

  //ENVIAR EL ARREGLO DE FOTOS DEL FRONT A BACKEND Y REGRESA EL WORD , ¿PDF?
  exportarImagenes(payload: any): Observable<any> {
    return this.http.post(`${this.url}/exportar-imagenes`, payload);
  }

  //EXPORTAR EL PDF Y ENVIARLO AL BACKEND PARA SU COMPRESION Y GUARDADO
  exportarPDF(pdfBlob: Blob, nombreArchivo: string): Observable<any> {
    const formData = new FormData();
    formData.append('pdf', pdfBlob, nombreArchivo);
    console.log('Enviando PDF al backend:', nombreArchivo); // Log para depuración
    return this.http.post<any>(`${this.url}/exportar-pdf`, formData);
  }

  procesarPDF(rutaArchivo: string, rutaPref: string): Observable<any> {
    return this.http.post<any>(`${this.url}/procesar-pdf`, {
      rutaArchivo,
      rutaPref,
    });
  }

  //Copiar archivos de lectura de datos , servicio que conecta con el enpooint desl backend .
  copiarArchivo() {
    return this.http.post(`${this.url}/copiarArchivo`, {}); //Servicio que copia el txt del origen y lo copia en temp
  }
}