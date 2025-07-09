import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { PlantillaService } from 'src/shared/plantilla.service'; // Ajusta la ruta según corresponda
import { ToastrService } from 'ngx-toastr'; 

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'front-plantilla-fotos';
  private subscription!: Subscription; // Declara una propiedad para almacenar la suscripción

  constructor(private plantillaService: PlantillaService, private toastr: ToastrService) { }

  ngOnInit(): void {
    // Llama al servicio copiarArchivo al iniciar la aplicación
    this.subscription = this.plantillaService.copiarArchivo().subscribe({
      next: (response: any) => {
        console.log('Archivo copiado con éxito:', response);
        this.toastr.success('Archivo copiado con éxito: ' + response.mensaje);
      },
      error: (error) => {
        console.error('Error al copiar el archivo:', error);
        this.toastr.error('Error al copiar el archivo: ' + error.message);
      }
    });
  }

  ngOnDestroy(): void {
    // Verifica si la suscripción existe y desuscríbete
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}