import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-visualizador',
  templateUrl: './visualizador.component.html',
  styleUrls: ['./visualizador.component.css']
})
export class VisualizadorComponent {

  constructor(private router: Router) { }

ngOnInit() {
  this.router.navigate(['/home']);
}

}
